import { db, auth } from './firebase.js';
import { collection, addDoc, getDocs, serverTimestamp, deleteDoc, doc, updateDoc, query, where, orderBy } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

// Instructor Portal Script
function logout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('loginTime');
    window.location.href = 'login.html';
  }
}

window.logout = logout;

function displayInstructorName() {
  const currentUser = localStorage.getItem('currentUser');
  if (currentUser) {
    const user = JSON.parse(currentUser);
    const instructorNameElement = document.getElementById('instructorName');
    if (instructorNameElement) {
      instructorNameElement.textContent = user.name;
    }
  }
}

document.addEventListener('DOMContentLoaded', function() {
  displayInstructorName();
  loadInstructorSchedule();
  loadAnnouncements();
  loadForumPosts();
  setupInstructorEventListeners();
  showNotification('Welcome, Instructor! 👋', 'info');
});

async function loadInstructorSchedule() {
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
  const currentInstructorId = currentUser.id || currentUser.uid || '';

  const adminData = getAdminData();
  const localSchedules = (adminData.schedules || []).filter(s => s.instructorUid === currentInstructorId || s.instructor === currentUser.name);
  const localLabs = (adminData.labs || []).filter(l => l.instructorId === currentInstructorId || l.instructor === currentUser.name);

  let firestoreSchedules = [];
  let firestoreLabs = [];
  try {
    const scheduleSnapshot = await getDocs(collection(db, 'schedules'));
    scheduleSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (!data) return;
      if (data.instructorUid === currentInstructorId || data.instructorId === currentInstructorId || data.instructor === currentUser.name) {
        firestoreSchedules.push({ id: docSnap.id, ...data });
      }
    });

    const labSnapshot = await getDocs(collection(db, 'labs'));
    labSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (!data) return;
      if (data.instructorId === currentInstructorId || data.instructor === currentUser.name) {
        firestoreLabs.push({ id: docSnap.id, ...data });
      }
    });
  } catch (error) {
    console.error('Error loading Firestore instructor data:', error);
  }

  const dedupeByKey = (items) => {
    const map = new Map();
    items.forEach(item => {
      const key = item.firestoreId || item.id || `${item.studentId || item.studentUid || ''}-${item.date || ''}-${item.shift || ''}-${item.instructorId || item.instructorUid || ''}`;
      if (!map.has(key)) {
        map.set(key, item);
      }
    });
    return [...map.values()];
  };

  const scheduleList = dedupeByKey([...localSchedules, ...firestoreSchedules]);
  const labList = dedupeByKey([...localLabs, ...firestoreLabs]);

  renderScheduleTable(scheduleList);
  renderLabTable(labList);
  updateInstructorStats(scheduleList, labList);
  setupScheduleFormListeners();

  const section = localStorage.getItem('currentSection') || 'dashboard';
  if (document.getElementById(section)) {
    showSection(section);
  }
}

function getAdminData() {
  return JSON.parse(localStorage.getItem('nursingHubAdminData') || '{}');
}

function saveAdminData(data) {
  localStorage.setItem('nursingHubAdminData', JSON.stringify(data));
}

function updateInstructorStats(schedules, labs) {
  const studentIds = new Set();
  schedules.forEach(schedule => {
    if (schedule.studentId && schedule.studentId.trim()) {
      studentIds.add(schedule.studentId.trim());
    } else if (schedule.studentUid && schedule.studentUid.trim()) {
      studentIds.add(schedule.studentUid.trim());
    }
  });

  const pending = (labs || []).filter(l => !l.reviewed || l.reviewed === false).length;
  const reviewed = (labs || []).filter(l => l.reviewed === true).length;

  const studentCountEl = document.getElementById('scheduleStudentCount');
  const pendingCountEl = document.getElementById('pendingLabCount');
  const reviewedCountEl = document.getElementById('reviewedLabCount');

  if (studentCountEl) studentCountEl.textContent = String(studentIds.size);
  if (pendingCountEl) pendingCountEl.textContent = String(pending);
  if (reviewedCountEl) reviewedCountEl.textContent = String(reviewed);
}

function setupScheduleFormListeners() {
  const addScheduleBtn = document.getElementById('addScheduleBtn');
  if (addScheduleBtn) {
    addScheduleBtn.addEventListener('click', async () => {
      const studentName = document.getElementById('scheduleStudentName').value.trim();
      const studentId = document.getElementById('scheduleStudentId').value.trim();
      const date = document.getElementById('scheduleDate').value;
      const hospital = document.getElementById('scheduleHospital').value.trim();
      const ward = document.getElementById('scheduleWard').value.trim();
      const shift = document.getElementById('scheduleShift').value.trim();

      if (!studentName || !date || !hospital || !ward || !shift) {
        showNotification('Please fill all schedule fields.', 'warning');
        return;
      }

      let studentUid = '';
      let resolvedStudentName = studentName;
      try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        let foundStudent = null;
        usersSnapshot.forEach(docSnap => {
          const u = docSnap.data();
          if (!u || u.role !== 'student') return;
          if (u.studentId === studentId || u.email === studentId || u.id === studentId || docSnap.id === studentId) {
            foundStudent = { uid: docSnap.id, ...u };
          }
        });
        if (!foundStudent) {
          showNotification('Invalid student ID. Please enter a registered student ID.', 'error');
          return;
        }
        studentUid = foundStudent.uid;
        resolvedStudentName = foundStudent.name || studentName;
      } catch (err) {
        console.error('Failed to lookup student user:', err);
        showNotification('Student validation failed. Please try again.', 'error');
        return;
      }

      const adminData = getAdminData();
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
      const scheduleEntry = {
        studentName: resolvedStudentName,
        studentId,
        studentUid,
        studentLegacyId: studentId,
        date,
        hospital,
        ward,
        shift,
        instructor: currentUser.name || 'Instructor',
        instructorId: currentUser.id || currentUser.uid || '',
        instructorUid: currentUser.id || currentUser.uid || '',
        createdAt: serverTimestamp()
      };
      adminData.schedules = adminData.schedules || [];
      const localScheduleId = 'sch_' + Date.now();
      const scheduleForLocal = { id: localScheduleId, ...scheduleEntry };
      adminData.schedules.push(scheduleForLocal);
      saveAdminData(adminData);
      try {
        const docRef = await addDoc(collection(db, 'schedules'), scheduleEntry);
        const idx = adminData.schedules.findIndex(s => s.id === localScheduleId);
        if (idx !== -1) {
          adminData.schedules[idx].firestoreId = docRef.id;
          saveAdminData(adminData);
        }
      } catch (error) {
        console.error('Failed to sync schedule to Firestore:', error);
      }
      const filteredSchedules = (adminData.schedules || []).filter(s => s.instructorUid === scheduleEntry.instructorUid || s.instructorId === scheduleEntry.instructorId);
      const uniqueSchedules = Array.from(new Map(filteredSchedules.map(s => [s.firestoreId || s.id, s])).values());
      renderScheduleTable(uniqueSchedules);
      clearScheduleForm();
      showNotification('Schedule added successfully.', 'success');
    });
  }

}

function clearScheduleForm() {
  ['scheduleStudentName', 'scheduleStudentId', 'scheduleDate', 'scheduleHospital', 'scheduleWard', 'scheduleShift'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function clearLabForm() {
  ['labStudentName', 'labStudentId', 'labTestName', 'labDate', 'labStatus', 'labNotes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const statusEl = document.getElementById('labStatus');
  if (statusEl) statusEl.value = 'Pending';
}

function getDisplayStudentId(studentId, studentUid) {
  if (!studentId || studentId === studentUid) {
    return '';
  }
  return studentId;
}

function renderScheduleTable(schedules) {
  const body = document.getElementById('scheduleTableBody');
  if (!body) return;
  body.innerHTML = '';
  if (!schedules || schedules.length === 0) {
    body.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#666; padding:10px;">No schedules found.</td></tr>';
    return;
  }
  schedules.forEach(entry => {
    const studentId = getDisplayStudentId(entry.studentId || entry.studentUid, entry.studentUid);
    const studentDisplay = `${escapeHtml(entry.studentName)}${studentId ? ' (' + escapeHtml(studentId) + ')' : ''}`;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${new Date(entry.date).toLocaleDateString()}</td>
      <td>${studentDisplay}</td>
      <td>${escapeHtml(entry.hospital)}</td>
      <td>${escapeHtml(entry.ward)}</td>
      <td>${escapeHtml(entry.shift)}</td>
      <td><button class="primary" style="background:#e53e3e;padding:6px 10px;font-size:12px;" onclick="deleteSchedule('${entry.id}')">Delete</button></td>
    `;
    body.appendChild(row);
  });
}

function renderLabTable(labs) {
  const body = document.getElementById('labTableBody');
  if (!body) return;
  body.innerHTML = '';
  if (!labs || labs.length === 0) {
    body.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#666; padding:10px;">No lab tests recorded.</td></tr>';
    return;
  }
  labs.forEach(lab => {
    const reviewed = lab.reviewed ? 'Reviewed' : 'Pending';
    const reviewedClass = lab.reviewed ? 'status-completed' : 'status-pending';
    const studentId = getDisplayStudentId(lab.studentId || lab.studentUid, lab.studentUid);
    const studentDisplay = `${escapeHtml(lab.studentName)}${studentId ? ' (' + escapeHtml(studentId) + ')' : ''}`;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${studentDisplay}</td>
      <td>${escapeHtml(lab.testName)}</td>
      <td>${new Date(lab.date).toLocaleDateString()}</td>
      <td>${escapeHtml(lab.result || 'N/A')}</td>
      <td>${escapeHtml(lab.notes || 'N/A')}</td>
      <td>
        <span class="status-badge ${reviewedClass}">${reviewed}</span>
        <div style="margin-top:6px; display:flex; gap:6px;">
          <button class="primary" style="background:#2f855a;padding:6px 10px;font-size:12px;" onclick="toggleLabReview('${lab.id}')">${lab.reviewed ? 'Unmark' : 'Reviewed'}</button>
          <button class="primary" style="background:#e53e3e;padding:6px 10px;font-size:12px;" onclick="deleteLab('${lab.id}')">Delete</button>
        </div>
      </td>
    `;
    body.appendChild(row);
  });
}

function toggleLabReview(id) {
  const adminData = getAdminData();
  adminData.labs = (adminData.labs || []).map(l => l.id === id ? {...l, reviewed: !l.reviewed} : l);
  saveAdminData(adminData);
  renderLabTable(adminData.labs);
}
window.toggleLabReview = toggleLabReview;

async function deleteSchedule(id) {
  if (!confirm('Are you sure you want to delete this schedule?')) {
    return;
  }
  const adminData = getAdminData();
  const scheduleToDelete = (adminData.schedules || []).find(item => item.id === id || item.firestoreId === id);
  let firestoreId = id;
  if (scheduleToDelete) {
    firestoreId = scheduleToDelete.firestoreId || id;
  }

  try {
    if (firestoreId) {
      await deleteDoc(doc(db, 'schedules', firestoreId));
    }
  } catch (err) {
    console.warn('Unable to delete Firestore schedule (might not exist):', err);
  }

  adminData.schedules = (adminData.schedules || []).filter(item => item.id !== id && item.firestoreId !== id);
  saveAdminData(adminData);

  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
  const filteredSchedules = (adminData.schedules || []).filter(s => s.instructorUid === currentUser.id || s.instructorId === currentUser.id || s.instructorUid === currentUser.uid || s.instructorId === currentUser.uid);
  renderScheduleTable(filteredSchedules);
  showNotification('Schedule removed.', 'info');
}
window.deleteSchedule = deleteSchedule;

async function deleteLab(id) {
  if (!confirm('Are you sure you want to delete this lab entry?')) {
    return;
  }
  const adminData = getAdminData();
  const labToDelete = (adminData.labs || []).find(item => item.id === id || item.firestoreId === id);
  let firestoreId = id;
  if (labToDelete) {
    firestoreId = labToDelete.firestoreId || id;
  }

  try {
    if (firestoreId) {
      await deleteDoc(doc(db, 'labs', firestoreId));
    }
  } catch (err) {
    console.warn('Unable to delete Firestore lab (might not exist):', err);
  }

  adminData.labs = (adminData.labs || []).filter(item => item.id !== id && item.firestoreId !== id);
  saveAdminData(adminData);
  renderLabTable(adminData.labs);
  showNotification('Lab result removed.', 'info');
}
window.deleteLab = deleteLab;

function showSection(sectionId, event) {
  const sections = document.querySelectorAll('.section');
  sections.forEach(s => s.classList.add('hidden'));
  const target = document.getElementById(sectionId);
  if (target) target.classList.remove('hidden');

  // Automatic load for section that needs fresh data
  if (sectionId === 'dutyRequirement') {
    loadInstructorDutyView();
  }

  const buttons = document.querySelectorAll('.sidebar button');
  buttons.forEach(btn => btn.classList.remove('active'));
  if (event && event.currentTarget) event.currentTarget.classList.add('active');

  localStorage.setItem('currentSection', sectionId);
}

window.showSection = showSection;

async function loadInstructorDutyView() {
  const container = document.getElementById('instructorDutyFolders');
  if (!container) return;

  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
  const currentInstructorId = currentUser.id || currentUser.uid || '';
  const currentInstructorName = currentUser.name || '';

  // LocalStorage copy
  const localDutyFiles = JSON.parse(localStorage.getItem('dutyRequirementFiles') || '[]');

  // Firestore query for submitted duty requirements and then filter for this instructor
  const firestoreDutyFiles = [];
  try {
    const querySnapshot = await getDocs(query(collection(db, 'dutyRequirements'), where('submitted', '==', true)));
    querySnapshot.forEach(docSnap => {
      const item = docSnap.data();
      if (!item) return;

      const matchesInstructor =
        (item.instructorId && item.instructorId === currentInstructorId) ||
        (item.instructor && item.instructor === currentInstructorName) ||
        (!item.instructorId && !item.instructor);

      if (matchesInstructor) {
        firestoreDutyFiles.push({ firestoreId: docSnap.id, ...item });
      }
    });
  } catch (err) {
    console.error('Error loading duty requirements from Firestore:', err);
  }

  const allFilesMap = new Map();
  const appendFile = f => {
    if (!f) return;
    const key = f.firestoreId || f.id || `${f.studentId || f.studentUid || 'unknown'}-${f.uploadDate || ''}-${f.fileName || ''}`;
    if (!allFilesMap.has(key)) {
      allFilesMap.set(key, f);
    }
  };

  localDutyFiles.forEach(file => {
    if (file.submitted && ((file.instructorId === currentInstructorId) || (file.instructor === currentInstructorName) || !file.instructorId)) {
      appendFile(file);
    }
  });

  firestoreDutyFiles.forEach(file => {
    appendFile(file);
  });

  const submittedFiles = Array.from(allFilesMap.values());

  if (submittedFiles.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px; grid-column: 1/-1;">No submitted duty requirements yet.</p>';
    return;
  }

  const studentFolders = {};
  submittedFiles.forEach(file => {
    const key = file.studentId || file.studentUid || 'unknown';
    if (!studentFolders[key]) {
      studentFolders[key] = {
        studentName: file.studentName || 'Unknown Student',
        studentId: file.studentId || file.studentUid || 'N/A',
        files: []
      };
    }
    studentFolders[key].files.push(file);
  });

  // Duty folder grid container (2 columns)
  container.style.display = 'grid';
  container.style.gridTemplateColumns = 'repeat(2, minmax(240px, 1fr))';
  container.style.gridGap = '14px';
  container.style.overflowX = 'hidden';
  container.style.overflowY = 'visible';
  container.innerHTML = '';

  Object.values(studentFolders).forEach(folder => {
    const card = document.createElement('div');
    card.className = 'student-folder-card';
    card.style.minWidth = 'auto';
    card.style.maxHeight = '380px';
    card.style.overflowY = 'auto';
    card.style.background = '#fff';
    card.style.border = '1px solid #e5e7eb';
    card.style.borderRadius = '10px';
    card.style.padding = '12px';
    card.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)';
    card.innerHTML = `
      <div class="folder-header">
        <div class="folder-header-icon">📁</div>
        <div class="folder-header-info">
          <h4>${folder.studentName} (${folder.studentId})</h4>
          <p>${folder.files.length} file(s)</p>
        </div>
      </div>
      <div class="folder-content"></div>
    `;

    const folderContent = card.querySelector('.folder-content');
    folderContent.style.maxHeight = '400px';
    folderContent.style.overflowY = 'auto';
    folderContent.style.gap = '8px';
    folderContent.style.display = 'flex';
    folderContent.style.flexDirection = 'column';
    folder.files.forEach(file => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      fileItem.style.display = 'flex';
      fileItem.style.alignItems = 'center';
      fileItem.style.justifyContent = 'space-between';
      fileItem.style.marginBottom = '10px';
      fileItem.style.padding = '8px';
      fileItem.style.border = '1px solid #e5e7eb';
      fileItem.style.borderRadius = '8px';

      const uploaded = file.uploadDate ? new Date(file.uploadDate).toLocaleDateString() : 'Unknown';
      const recordId = file.firestoreId || file.id || '';
      const isExternalLink = typeof file.fileContent === 'string' && /^(https?:\/\/)/i.test(file.fileContent);
      const actionButton = isExternalLink
        ? `<button class="open" onclick="openDutyLink('${recordId}')">Open</button>`
        : `<button class="open" onclick="downloadDutyFile('${recordId}')">Download</button>`;

      const deleteButton = `<button class="delete" onclick="deleteDutyFile('${recordId}')">Delete</button>`;

      const displayName = (file.fileName || '').replace(/\s*Link$/i, '');

      fileItem.innerHTML = `
        <div class="file-info">
          <div class="file-name">${displayName}</div>
          <div class="file-meta">${uploaded} • ${(file.fileSize || 0)/1024 ? ((file.fileSize || 0)/1024).toFixed(1) : '0.0'} KB</div>
        </div>
        <div class="file-actions" style="display:flex; gap:6px; align-items:center;">
          ${actionButton}
          ${deleteButton}
        </div>
      `;
      folderContent.appendChild(fileItem);
    });

    container.appendChild(card);
  });
}
window.loadInstructorDutyView = loadInstructorDutyView;


async function deleteDutyFile(fileId) {
  if (!confirm('Are you sure you want to delete this duty file?')) {
    return;
  }

  let dutyFiles = JSON.parse(localStorage.getItem('dutyRequirementFiles') || '[]');
  const target = dutyFiles.find(file => file.id === fileId || file.firestoreId === fileId);

  if (target && target.firestoreId) {
    try {
      await deleteDoc(doc(db, 'dutyRequirements', target.firestoreId));
      showNotification('Duty file removed from Firestore.', 'success');
    } catch (err) {
      console.warn('Failed to delete duty file from Firestore:', err);
      showNotification('Could not delete from Firestore, but local copy will be removed.', 'warning');
    }
  }

  dutyFiles = dutyFiles.filter(file => file.id !== fileId && file.firestoreId !== fileId);
  localStorage.setItem('dutyRequirementFiles', JSON.stringify(dutyFiles));
  await loadInstructorDutyView();
  showNotification('Duty file deleted.', 'info');
}
window.deleteDutyFile = deleteDutyFile;

async function downloadDutyFile(fileId) {
  let dutyFiles = JSON.parse(localStorage.getItem('dutyRequirementFiles') || '[]');
  let file = dutyFiles.find(file => file.id === fileId || file.firestoreId === fileId);

  if (!file && fileId) {
    try {
      const docSnap = await getDoc(doc(db, 'dutyRequirements', fileId));
      if (docSnap.exists()) {
        file = { firestoreId: docSnap.id, ...docSnap.data() };
      }
    } catch (err) {
      console.error('Failed to fetch duty file from Firestore for download:', err);
    }
  }

  if (!file) {
    showNotification('File not found!', 'warning');
    return;
  }

  const content = file.fileContent || file.fileUrl;
  if (!content) {
    showNotification('File data not available for download!', 'warning');
    return;
  }

  const link = document.createElement('a');
  link.href = content;
  link.download = file.fileName || `${file.fileType || 'duty'}-submission`;
  link.click();
  showNotification('Downloading file...', 'success');
}
window.downloadDutyFile = downloadDutyFile;

async function openDutyLink(fileId) {
  let dutyFiles = JSON.parse(localStorage.getItem('dutyRequirementFiles') || '[]');
  let file = dutyFiles.find(f => f.id === fileId || f.firestoreId === fileId);

  if (!file && fileId) {
    try {
      const docSnap = await getDoc(doc(db, 'dutyRequirements', fileId));
      if (docSnap.exists()) {
        file = { firestoreId: docSnap.id, ...docSnap.data() };
      }
    } catch (err) {
      console.error('Failed to fetch duty file from Firestore for open link:', err);
    }
  }

  if (!file || !file.fileContent) {
    showNotification('Link not available.', 'warning');
    return;
  }

  const link = file.fileContent;
  if (!/^(https?:\/\/)/i.test(link)) {
    showNotification('Invalid URL.', 'warning');
    return;
  }

  window.open(link, '_blank');
  showNotification('Opening link in a new tab...', 'success');
}
window.openDutyLink = openDutyLink;

async function loadAnnouncements() {
  const container = document.getElementById('announcementsContainer');
  if (!container) return;
  container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Loading announcements...</p>';

  try {
    const snap = await getDocs(query(collection(db, 'forum'), orderBy('createdAt', 'desc')));
    const announcements = snap.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .filter(item => item.type === 'announcement');

    if (announcements.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No announcements yet. Post updates for students.</p>';
      return;
    }

    container.innerHTML = '';
    announcements.forEach(announcement => {
      const card = document.createElement('div');
      card.className = 'post';
      card.style.borderLeftColor = '#f59e0b';
      const createdAt = announcement.createdAt?.toDate ? announcement.createdAt.toDate() : new Date(announcement.createdAt || Date.now());
      card.innerHTML = `
        <strong>📢 Announcement: ${escapeHtml(announcement.title)}</strong>
        <div style="margin-top: 8px; color: #555; font-size: 14px;">${escapeHtml(announcement.message)}</div>
        <div class="timestamp" style="margin-top: 8px;">${createdAt.toLocaleString()}</div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading announcements from Firestore:', err);
    container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Unable to load announcements right now.</p>';
  }
}

async function addForumPost() {
  const input = document.getElementById('forumInput');
  const text = input.value.trim();
  if (text === '') {
    showNotification('Please write a discussion first', 'warning');
    return;
  }
  if (text.length > 500) {
    showNotification('(Max 500 characters)', 'warning');
    return;
  }

  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
  const postPayload = {
    type: 'discussion',
    text,
    authorName: currentUser.name || 'Unknown',
    authorId: currentUser.id || currentUser.uid || '',
    role: currentUser.role || 'student',
    createdAt: serverTimestamp()
  };

  try {
    await addDoc(collection(db, 'forum'), postPayload);
    input.value = '';
    await loadForumPosts();
    showNotification('Discussion posted! 💬', 'success');
  } catch (err) {
    console.error('Error adding forum post:', err);
    showNotification('Could not post discussion. Please try again.', 'error');
  }
}

async function loadForumPosts() {
  const container = document.getElementById('forumPosts');
  if (!container) return;
  container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Loading forum discussions...</p>';

  try {
    const snap = await getDocs(query(collection(db, 'forum'), orderBy('createdAt', 'desc')));
    const posts = snap.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .filter(item => item.type === 'discussion');

    if (posts.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No forum discussions yet.</p>';
      return;
    }

    container.innerHTML = '';
    posts.forEach(postData => {
      const postEl = createForumPostElement(postData.text, postData.authorName, postData.role, postData.createdAt, postData.id, postData.authorId);
      container.appendChild(postEl);
    });
  } catch (err) {
    console.error('Error loading forum discussions:', err);
    container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Unable to load forum discussions right now.</p>';
  }
}

function createForumPostElement(text, authorName = 'Unknown', role = '', createdAt = new Date(), postId = null, authorId = null) {
  const post = document.createElement('div');
  post.className = 'post';
  post.style.borderLeftColor = '#0066cc';

  const timestamp = createdAt?.toDate ? createdAt.toDate().toLocaleString() : new Date(createdAt).toLocaleString();
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
  const canDelete = currentUser.role === 'admin' || currentUser.id === authorId;

  post.innerHTML = `
    <strong>💬 ${escapeHtml(authorName)} (${escapeHtml(role)})</strong>
    <div style="margin-top: 8px; color: #555; font-size: 14px;">${escapeHtml(text)}</div>
    <div class="timestamp">${timestamp}</div>
    ${canDelete && postId ? '<button class="delete-post" style="background:none;border:none;color:#c62828;cursor:pointer;font-size:12px;margin-top:8px;">Delete</button>' : ''}
  `;

  if (canDelete && postId) {
    const deleteBtn = post.querySelector('.delete-post');
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Delete this discussion post?')) return;
      try {
        await deleteDoc(doc(db, 'forum', postId));
        await loadForumPosts();
        showNotification('Discussion deleted.', 'info');
      } catch (err) {
        console.error('Failed to delete forum post:', err);
        showNotification('Could not delete discussion post.', 'error');
      }
    });
  }

  return post;
}

function setupInstructorEventListeners() {
  const forumInput = document.getElementById('forumInput');
  const charCount = document.createElement('div');
  charCount.className = 'character-count';
  charCount.style.marginTop = '8px';
  forumInput.parentNode.insertBefore(charCount, forumInput.nextSibling);
  forumInput.addEventListener('input', function() {
    charCount.textContent = `${this.value.length}/500 characters`;
  });
  forumInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.ctrlKey) {
      addForumPost();
    }
  });
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'slideInRight 0.3s ease reverse';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function escapeHtml(text) {
  if (text === null || text === undefined) {
    return '';
  }
  const safeText = String(text);
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return safeText.replace(/[&<>"']/g, m => map[m]);
}

window.addForumPost = addForumPost;
window.loadForumPosts = loadForumPosts;
