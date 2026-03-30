import { db } from './firebase.js';
import { collection, doc, addDoc, getDocs, deleteDoc, serverTimestamp, query, where, orderBy, updateDoc } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

// Logout function
function logout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('loginTime');
    window.location.href = 'login.html';
  }
}
window.logout = logout;

function showSection(sectionId, event) {
  const sections = document.querySelectorAll('.section');
  sections.forEach(section => section.classList.add('hidden'));
  const target = document.getElementById(sectionId);
  if (target) target.classList.remove('hidden');
  const buttons = document.querySelectorAll('.sidebar button');
  buttons.forEach(btn => btn.classList.remove('active'));
  if (event && event.currentTarget) event.currentTarget.classList.add('active');
  localStorage.setItem('currentSection', sectionId);
  
  // Re-initialize duty requirement view when switching to it
  if (sectionId === 'dutyRequirement') {
    initializeDutyRequirement();
  }
}
window.showSection = showSection;

// Display student name from logged-in user
function displayStudentName() {
  const currentUser = localStorage.getItem('currentUser');
  if (currentUser) {
    const user = JSON.parse(currentUser);
    const userNameElement = document.getElementById('userName');
    const roleLabel = document.getElementById('roleLabel');
    if (userNameElement && roleLabel) {
      userNameElement.textContent = user.name;
      roleLabel.textContent = user.role === 'student' ? '👤 Student:' : (user.role === 'instructor' ? '👤 Instructor:' : '👤 User:');
    }
    // Role-based UI
    if (user.role === 'instructor') {
      // Hide student-only features
      document.getElementById('scheduleBtn').style.display = 'none';
      document.getElementById('labBtn').style.display = 'none';
    }
  }
}

async function populateInstructorSelects() {
  const instructorSelects = [document.getElementById('studentLabInstructor'), document.getElementById('dutyLinkInstructor')];
  instructorSelects.forEach(select => {
    if (select) select.innerHTML = '<option value="">Select Instructor</option>';
  });

  // Local data fallback for non-Firestore setups
  const adminData = getAdminData();
  const localInstructors = (adminData.instructors || []).filter(i => i.name || i.email);
  localInstructors.forEach(instr => {
    const value = instr.uid || instr.id || instr.instructorId || instr.email || instr.name;
    const label = instr.name || instr.email || 'Instructor';
    instructorSelects.forEach(select => {
      if (select) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      }
    });
  });

  try {
    const usersSnapshot = await getDocs(query(collection(db, 'users'), where('role', '==', 'instructor')));
    usersSnapshot.forEach(docSnap => {
      const instructor = docSnap.data();
      const value = docSnap.id;
      const label = instructor.name || instructor.email || 'Instructor';
      instructorSelects.forEach(select => {
        if (select) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = label;
          select.appendChild(option);
        }
      });
    });
  } catch (error) {
    console.error('Failed to load instructors for student selects:', error);
  }
}

// Initialize app on page load
document.addEventListener('DOMContentLoaded', async function() {
  displayStudentName();
  await loadStudentData();
  loadNotesFromStorage();
  setupEventListeners();
  await populateInstructorSelects();
  setupStudentSubmissionListeners();
  await loadAnnouncementsFromFirestore();
  await loadForumDiscussions();
  initializeDutyRequirement();
  setupDutyRequirementFilters();
  showNotification('Welcome back! 👋', 'info');
});

function getAdminData() {
  return JSON.parse(localStorage.getItem('nursingHubAdminData') || '{}');
}

function saveAdminData(data) {
  localStorage.setItem('nursingHubAdminData', JSON.stringify(data));
}

async function loadStudentData() {
  const currentUser = localStorage.getItem('currentUser');
  if (!currentUser) return;

  const user = JSON.parse(currentUser);
  const adminData = getAdminData();
  const studentIdKey = user.id || user.studentId || '';

  const localSchedules = (adminData.schedules || []).filter(s =>
    s.studentUid === studentIdKey ||
    s.studentId === studentIdKey ||
    s.studentLegacyId === studentIdKey ||
    s.studentUid === user.id ||
    s.studentId === user.studentId ||
    s.studentLegacyId === user.studentId ||
    s.studentId === user.email ||
    s.studentName === user.name
  );

  const localDemos = (adminData.demonstrations || []).filter(d =>
    d.studentUid === studentIdKey ||
    d.studentId === studentIdKey ||
    d.studentLegacyId === studentIdKey ||
    d.studentUid === user.id ||
    d.studentId === user.studentId ||
    d.studentLegacyId === user.studentId ||
    d.studentId === user.email ||
    d.studentName === user.name
  );

  const localLabs = (adminData.labs || []).filter(l =>
    l.studentUid === studentIdKey ||
    l.studentId === studentIdKey ||
    l.studentLegacyId === studentIdKey ||
    l.studentUid === user.id ||
    l.studentId === user.studentId ||
    l.studentLegacyId === user.studentId ||
    l.studentId === user.email ||
    l.studentName === user.name
  );

  let firestoreSchedules = [];
  let firestoreDemos = [];
  let firestoreLabs = [];

  try {
    const scheduleSnapshot = await getDocs(collection(db, 'schedules'));
    scheduleSnapshot.forEach(docSnap => {
      const s = docSnap.data();
      if (!s) return;
      if (
        s.studentUid === studentIdKey ||
        s.studentId === studentIdKey ||
        s.studentLegacyId === studentIdKey ||
        s.studentUid === user.id ||
        s.studentId === user.studentId ||
        s.studentLegacyId === user.studentId ||
        s.studentId === user.email ||
        s.studentName === user.name
      ) {
        firestoreSchedules.push({ id: docSnap.id, ...s });
      }
    });

    const demoSnapshot = await getDocs(collection(db, 'demonstrations'));
    demoSnapshot.forEach(docSnap => {
      const d = docSnap.data();
      if (!d) return;
      if (
        d.studentUid === studentIdKey ||
        d.studentId === studentIdKey ||
        d.studentLegacyId === studentIdKey ||
        d.studentUid === user.id ||
        d.studentId === user.studentId ||
        d.studentLegacyId === user.studentId ||
        d.studentId === user.email ||
        d.studentName === user.name
      ) {
        firestoreDemos.push({ id: docSnap.id, ...d });
      }
    });

    const labSnapshot = await getDocs(collection(db, 'labs'));
    labSnapshot.forEach(docSnap => {
      const l = docSnap.data();
      if (!l) return;
      if (
        l.studentUid === studentIdKey ||
        l.studentId === studentIdKey ||
        l.studentLegacyId === studentIdKey ||
        l.studentUid === user.id ||
        l.studentId === user.studentId ||
        l.studentLegacyId === user.studentId ||
        l.studentId === user.email ||
        l.studentName === user.name
      ) {
        firestoreLabs.push({ id: docSnap.id, ...l });
      }
    });
  } catch (error) {
    console.error('Error loading Firestore student data:', error);
  }

  const dedupe = (items) => {
    const map = new Map();
    items.forEach(item => {
      const key = item.firestoreId || item.id || `${item.studentId || item.studentUid || ''}-${item.date || item.testName || item.procedure || ''}-${item.shift || ''}`;
      if (!map.has(key)) map.set(key, item);
    });
    return [...map.values()];
  };

  const schedules = dedupe([...localSchedules, ...firestoreSchedules]);
  const demos = dedupe([...localDemos, ...firestoreDemos]);
  const labs = dedupe([...localLabs, ...firestoreLabs]);

  loadSchedulesTable(schedules);
  loadDemosTable(demos);
  loadLabsTable(labs);
  updateStudentStats(schedules, demos, labs);
}

function setupStudentSubmissionListeners() {
  const submitLabBtn = document.getElementById('submitLabBtn');
  if (submitLabBtn) {
    submitLabBtn.addEventListener('click', async function() {
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
      const testName = document.getElementById('studentLabTestName').value.trim();
      const result = document.getElementById('studentLabResult').value.trim();
      const date = document.getElementById('studentLabDate').value;
      const instructor = document.getElementById('studentLabInstructor').value;
      const notes = document.getElementById('studentLabNotes').value.trim();

      if (!testName || !result || !date || !instructor) {
        showNotification('Please fill lab test name, result, date, and select instructor.', 'warning');
        return;
      }

      const adminData = getAdminData();
      const labEntry = {
        studentName: currentUser.name || 'Student',
        studentId: currentUser.studentId || currentUser.id || '',
        studentUid: currentUser.uid || currentUser.id || '',
        testName,
        date,
        result,
        notes,
        instructorId: instructor,
        instructor: document.getElementById('studentLabInstructor').selectedOptions[0].textContent,
        createdAt: serverTimestamp()
      };

      adminData.labs = adminData.labs || [];
      const localLabId = 'lab_' + Date.now();
      adminData.labs.push({ id: localLabId, ...labEntry });
      saveAdminData(adminData);

      try {
        const docRef = await addDoc(collection(db, 'labs'), labEntry);
        const index = adminData.labs.findIndex(l => l.id === localLabId);
        if (index !== -1) {
          adminData.labs[index].firestoreId = docRef.id;
          saveAdminData(adminData);
        }
      } catch (err) {
        console.error('Failed to save lab to Firestore:', err);
      }

      await loadStudentData();
      clearStudentLabForm();
      showNotification('Lab test submitted for instructor review.', 'success');
    });
  }
}

function clearStudentLabForm() {
  ['studentLabTestName', 'studentLabResult', 'studentLabDate', 'studentLabInstructor', 'studentLabNotes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = ''; 
  });
  const instructorSel = document.getElementById('studentLabInstructor');
  if (instructorSel) instructorSel.value = '';
}

// Load schedules table
function loadSchedulesTable(schedules) {
  const tbody = document.getElementById('scheduleBody');
  tbody.innerHTML = '';
  
  if (schedules.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999; padding: 20px;">No scheduled duties yet. Check back later!</td></tr>';
    return;
  }
  
  schedules.forEach(schedule => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${new Date(schedule.date).toLocaleDateString()}</td>
      <td>${schedule.hospital}</td>
      <td>${schedule.ward}</td>
      <td>${schedule.shift}</td>
      <td>${schedule.instructor}</td>
    `;
    tbody.appendChild(row);
  });
}

// Load demonstrations table
function loadDemosTable(demos) {
  const tbody = document.getElementById('demoBody');
  if (!tbody) {
    // If the demo table is not present in the current UI, skip rendering.
    return;
  }

  tbody.innerHTML = '';
  
  if (demos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999; padding: 20px;">No demonstrations recorded yet.</td></tr>';
    return;
  }
  
  demos.forEach(demo => {
    const row = document.createElement('tr');
    const gradeClass = demo.grade >= 80 ? 'status-completed' : (demo.grade >= 70 ? 'status-pending' : 'status-warning');
    row.innerHTML = `
      <td>${demo.procedure}</td>
      <td>${new Date(demo.date).toLocaleDateString()}</td>
      <td><span class="status-badge ${gradeClass}">${demo.grade}%</span></td>
      <td>${demo.feedback || 'N/A'}</td>
      <td>${demo.instructor || 'N/A'}</td>
    `;
    tbody.appendChild(row);
  });
}

// Load labs table
function loadLabsTable(labs) {
  const tbody = document.getElementById('labBody');
  tbody.innerHTML = '';
  
  if (labs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999; padding: 20px;">No lab tests recorded yet.</td></tr>';
    return;
  }
  
  labs.forEach(lab => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${lab.testName}</td>
      <td>${new Date(lab.date).toLocaleDateString()}</td>
      <td>${lab.result || 'N/A'}</td>
      <td>${lab.instructor || 'N/A'}</td>
      <td>${lab.notes || 'N/A'}</td>
    `;
    tbody.appendChild(row);
  });
}

// Update student stats
function updateStudentStats(schedules, demos, labs) {
  const scheduleCountEl = document.getElementById('scheduleCount');
  const demoCountEl = document.getElementById('demoCount');
  const labCountEl = document.getElementById('labCount');

  if (scheduleCountEl) scheduleCountEl.textContent = schedules.length;
  if (demoCountEl) demoCountEl.textContent = demos.length;
  if (labCountEl) labCountEl.textContent = labs.length;
}

// Load announcements from Firestore
async function loadAnnouncementsFromFirestore() {
  const container = document.getElementById('announcementsContainer');
  if (!container) return;

  container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Loading announcements...</p>';

  try {
    const snapshot = await getDocs(query(collection(db, 'forum'), orderBy('createdAt', 'desc')));
    const announcements = snapshot.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .filter(item => item.type === 'announcement');

    if (announcements.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No announcements yet. Check back for instructor updates.</p>';
      return;
    }

    container.innerHTML = '';
    announcements.forEach(announcement => {
      const card = document.createElement('div');
      card.className = 'post';
      card.style.borderLeftColor = '#f59e0b';
      card.innerHTML = `
        <strong>📢 Announcement: ${escapeHtml(announcement.title || 'General')}</strong>
        <div style="margin-top: 8px; color: #555; font-size: 14px;">${escapeHtml(announcement.message || '')}</div>
        <div class="timestamp" style="margin-top: 8px;">${new Date(announcement.createdAt?.toDate ? announcement.createdAt.toDate() : announcement.createdAt || new Date()).toLocaleString()}</div>
      `;
      container.appendChild(card);
    });
  } catch (error) {
    console.error('Failed to load announcements from Firestore:', error);
    container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Unable to load announcements right now.</p>';
  }
}

async function loadForumDiscussions() {
  const container = document.getElementById('forumPosts');
  if (!container) return;

  container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Loading forum discussions...</p>';

  try {
    const snapshot = await getDocs(query(collection(db, 'forum'), orderBy('createdAt', 'desc')));
    const posts = snapshot.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .filter(item => item.type === 'discussion');

    if (posts.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No forum discussions yet.</p>';
      return;
    }

    container.innerHTML = '';
    posts.forEach(postData => {
      const post = createForumPostElement(postData.text, postData.authorName, postData.role, postData.createdAt, postData.id, postData.authorId);
      container.appendChild(post);
    });
  } catch (error) {
    console.error('Failed to load forum discussions from Firestore:', error);
    container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Unable to load forum discussions right now.</p>';
  }
}

async function addForumPost() {
  const input = document.getElementById('forumInput');
  const text = input.value.trim();

  if (text === '') {
    showNotification('Please write a discussion first! ✍️', 'warning');
    return;
  }
  if (text.length > 500) {
    showNotification('Discussion is too long! (Max 500 characters)', 'warning');
    return;
  }

  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
  const authorName = currentUser.name || 'Unknown';
  const role = currentUser.role || 'student';
  const authorId = currentUser.id || currentUser.uid || '';

  try {
    await addDoc(collection(db, 'forum'), {
      type: 'discussion',
      text,
      authorName,
      authorId,
      role,
      createdAt: serverTimestamp()
    });
    input.value = '';
    await loadForumDiscussions();
    showNotification('Discussion posted! 💬', 'success');
  } catch (error) {
    console.error('Failed to post discussion to Firestore:', error);
    showNotification('Unable to post discussion. Please try again.', 'error');
  }
}

function createForumPostElement(text, authorName = 'Unknown', role = '', createdAt = new Date(), postId = null, authorId = null) {
  const post = document.createElement('div');
  post.className = 'post';
  post.style.borderLeftColor = '#0066cc';

  const timestampValue = createdAt?.toDate ? createdAt.toDate().toLocaleString() : new Date(createdAt).toLocaleString();
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
  const canDelete = currentUser.id === authorId || currentUser.role === 'admin';

  post.innerHTML = `
    <strong>💬 ${escapeHtml(authorName)} (${escapeHtml(role)})</strong>
    <div style="margin-top: 8px; color: #555; font-size: 14px;">${escapeHtml(text)}</div>
    <div class="timestamp">${timestampValue}</div>
    ${canDelete && postId ? '<button class="delete-post" style="background:none;border:none;color:#c62828;cursor:pointer;font-size:12px;margin-top:8px;">Delete</button>' : ''}
  `;

  if (canDelete && postId) {
    const deleteBtn = post.querySelector('.delete-post');
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Delete this forum post?')) return;
      try {
        await deleteDoc(doc(db, 'forum', postId));
        post.remove();
        showNotification('Discussion deleted.', 'info');
      } catch (error) {
        console.error('Failed to delete forum post:', error);
        showNotification('Could not delete forum post.', 'error');
      }
    });
  }

  return post;
}

// Add note functionality (for personal notes only, not instructor announcements)
function addPost() {
  const input = document.getElementById('postInput');
  const text = input.value.trim();
  
  if (text === '') {
    showNotification('Please write a note first! ✍️', 'warning');
    return;
  }

  if (text.length > 500) {
    showNotification('Note is too long! (Max 500 characters)', 'warning');
    return;
  }

  const note = createNoteElement(text);
  document.getElementById('posts').appendChild(note);
  
  input.value = '';
  input.focus();
  
  // Save notes to localStorage
  saveNotesToStorage();
  
  showNotification('Note saved successfully! 📝', 'success');
}

// Create note element
function createNoteElement(text) {
  const note = document.createElement('div');
  note.className = 'post';
  note.style.borderLeftColor = '#0066cc';
  const timestamp = new Date().toLocaleString();
  note.innerHTML = `
    <strong>📝 My Note</strong>
    <div style="margin-top: 8px; color: #555; font-size: 14px;">${escapeHtml(text)}</div>
    <div class="timestamp">${timestamp}</div>
    <button class="delete-post" style="background: none; border: none; color: #999; cursor: pointer; font-size: 12px; margin-top: 8px;">Delete</button>
  `;
  
  // Add delete functionality with confirmation
  const deleteBtn = note.querySelector('.delete-post');
  deleteBtn.addEventListener('click', () => {
    if (!confirm('Are you sure you want to delete this note?')) {
      return;
    }
    note.remove();
    saveNotesToStorage();
    showNotification('Note deleted', 'info');
  });
  
  return note;
}

// Save notes to localStorage
function saveNotesToStorage() {
  const postsContainer = document.getElementById('posts');
  const notes = [];
  
  postsContainer.querySelectorAll('.post').forEach((post) => {
    const strongText = post.querySelector('strong').textContent;
    
    // Skip if it's an instructor announcement
    if (!strongText.includes('📝')) {
      return;
    }
    
    const textDiv = post.querySelector('[style*="color: #555"]');
    
    notes.push({
      text: textDiv ? textDiv.textContent : '',
      timestamp: post.querySelector('.timestamp')?.textContent || ''
    });
  });
  
  localStorage.setItem('studentNotes', JSON.stringify(notes));
}

// Load notes from localStorage
function loadNotesFromStorage() {
  const savedNotes = localStorage.getItem('studentNotes');
  if (!savedNotes) return;
  
  const postsContainer = document.getElementById('posts');
  if (!postsContainer) return;
  
  const notes = JSON.parse(savedNotes);
  notes.forEach(noteData => {
    const note = createNoteElement(noteData.text);
    postsContainer.appendChild(note);
  });
}

// Setup event listeners
function setupEventListeners() {
  const postInput = document.getElementById('postInput');
  if (postInput) {
    const charCount = document.createElement('div');
    charCount.className = 'character-count';
    charCount.style.marginTop = '8px';
    postInput.parentNode.insertBefore(charCount, postInput.nextSibling);
    
    postInput.addEventListener('input', function() {
      charCount.textContent = `${this.value.length}/500 characters`;
    });
    
    // Allow posting with Enter key
    postInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && e.ctrlKey) {
        addPost();
      }
    });
  }
  
  // Restore last viewed section
  const lastSection = localStorage.getItem('currentSection');
  if (lastSection) {
    const button = Array.from(document.querySelectorAll('.sidebar button')).find(btn => 
      btn.onclick.toString().includes(`'${lastSection}'`)
    );
    if (button) {
      button.click();
    }
  }
}

// Show notification
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

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Export data function
function exportData() {
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
  const data = {
    student: currentUser.name || 'Student',
    studentId: currentUser.id || 'N/A',
    exportDate: new Date().toLocaleString(),
    notes: JSON.parse(localStorage.getItem('studentNotes') || '[]')
  };
  
  const dataStr = JSON.stringify(data, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${currentUser.name || 'clinical'}-notes-${Date.now()}.json`;
  link.click();
  
  showNotification('Notes exported! 💾', 'success');
}

// Search functionality
function searchPosts(query) {
  const posts = document.querySelectorAll('.post');
  const lowerQuery = query.toLowerCase();
  
  posts.forEach(post => {
    const text = post.textContent.toLowerCase();
    post.style.display = text.includes(lowerQuery) ? 'block' : 'none';
  });
}

// Dark mode toggle
function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}

// Print schedule
function printSchedule() {
  window.print();
  showNotification('Opening print dialog...', 'info');
}

// Clear all personal notes
function clearAllData() {
  if (confirm('Are you sure you want to clear all your personal notes? This cannot be undone! (Instructor announcements will remain)')) {
    localStorage.removeItem('studentNotes');
    const postsContainer = document.getElementById('posts');
    
    // Keep only instructor announcements
    const announcements = postsContainer.querySelectorAll('.post');
    announcements.forEach(post => {
      const strongText = post.querySelector('strong').textContent;
      if (strongText.includes('📝')) {
        post.remove();
      }
    });
    
    showNotification('All personal notes cleared!', 'info');
  }
}

// Load page with preserved state
window.addEventListener('load', function() {
  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
  }
});

/******* DUTY REQUIREMENT FEATURE *******/

// File type to emoji mapping
const fileTypeEmojis = {
  'Learning Feedback Diary': '📖',
  'Drug Study': '💊',
  'Nursing Care Plan': '🏥'
};

// Get file extension icon
function getFileIcon(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const icons = {
    'pdf': '📄',
    'doc': '📝',
    'docx': '📝',
    'jpg': '🖼️',
    'jpeg': '🖼️',
    'png': '🖼️'
  };
  return icons[ext] || '📎';
}

// Upload duty file
async function uploadDutyFile(fileType) {
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
  if (!currentUser.id) {
    showNotification('Please log in first!', 'warning');
    return;
  }

  const fileInputId = fileType.toLowerCase().replace(/ /g, '') + 'File';
  const fileInput = document.getElementById(fileInputId);
  
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    showNotification('Please select a file first!', 'warning');
    return;
  }

  const file = fileInput.files[0];
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (file.size > maxSize) {
    showNotification('File size exceeds 10MB limit!', 'warning');
    return;
  }

  // Create file metadata
  const fileData = {
    fileName: file.name,
    fileSize: file.size,
    fileType: fileType,
    studentId: currentUser.id,
    studentName: currentUser.name || 'Student',
    studentEmail: currentUser.email || '',
    uploadDate: new Date().toISOString(),
    submitted: false,
    fileContent: null // In production, store in Firebase Storage or Cloud Firestore
  };

  // For now, store file data in localStorage (in production, use Firebase Storage)
  const dutyData = JSON.parse(localStorage.getItem('dutyRequirementFiles') || '[]');
  const fileId = 'file_' + Date.now();
  fileData.id = fileId;

  // Store base64 encoded file content
  const reader = new FileReader();
  reader.onload = async function(e) {
    fileData.fileContent = e.target.result;

    dutyData.push(fileData);
    localStorage.setItem('dutyRequirementFiles', JSON.stringify(dutyData));

    // Try to store in Firestore
    try {
      await addDoc(collection(db, 'dutyRequirements'), {
        ...fileData,
        fileContent: null // Don't store actual file content in Firestore
      });
    } catch (err) {
      console.warn('Could not sync with Firestore:', err);
    }

    fileInput.value = '';
    await loadStudentDutyFiles();
    showNotification(`${fileType} uploaded successfully! ✅`, 'success');
  };

  reader.readAsDataURL(file);
}
window.uploadDutyFile = uploadDutyFile;

async function submitDutyLink() {
  const link = (document.getElementById('dutyLinkUrl') || {}).value?.trim();
  const type = (document.getElementById('dutyLinkType') || {}).value;
  const instructor = (document.getElementById('dutyLinkInstructor') || {}).value;
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');

  if (!link || !type || !instructor) {
    showNotification('Please choose a type, instructor, and provide the link.', 'warning');
    return;
  }

  const dutyData = JSON.parse(localStorage.getItem('dutyRequirementFiles') || '[]');
  const newItem = {
    id: 'duty_' + Date.now(),
    fileName: `${type}`,
    fileSize: 0,
    fileType: type,
    fileContent: link,
    studentId: currentUser.studentId || currentUser.id || currentUser.uid || 'Unknown',
    studentUid: currentUser.uid || currentUser.id || '',
    studentName: currentUser.name || 'Student',
    studentEmail: currentUser.email || '',
    instructorId: instructor,
    instructor: document.getElementById('dutyLinkInstructor').selectedOptions[0].textContent,
    uploadDate: new Date().toISOString(),
    submitted: true
  };

  dutyData.push(newItem);
  localStorage.setItem('dutyRequirementFiles', JSON.stringify(dutyData));

  try {
    const docRef = await addDoc(collection(db, 'dutyRequirements'), newItem);
    newItem.firestoreId = docRef.id;
    const index = dutyData.findIndex(i => i.id === newItem.id);
    if (index !== -1) {
      dutyData[index].firestoreId = docRef.id;
      localStorage.setItem('dutyRequirementFiles', JSON.stringify(dutyData));
    }
    showNotification('Duty link submitted to instructor and saved in Firestore.', 'success');
  } catch (err) {
    console.error('Failed to save duty link to Firestore:', err);
    showNotification('Duty link saved locally but Firestore sync failed.', 'warning');
  }

  document.getElementById('dutyLinkUrl').value = '';
  document.getElementById('dutyLinkType').value = '';
  document.getElementById('dutyLinkInstructor').value = '';
  await loadStudentDutyFiles();
}
window.submitDutyLink = submitDutyLink;

// Load student duty files
async function loadStudentDutyFiles() {
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
  const container = document.getElementById('studentFilesList');
  
  if (!container) return;

  let dutyFiles = [];
  const localDutyFiles = JSON.parse(localStorage.getItem('dutyRequirementFiles') || '[]');

  try {
    const fsSnapshot = await getDocs(query(collection(db, 'dutyRequirements'), where('studentId', '==', currentUser.id)));
    fsSnapshot.forEach(docSnap => {
      const remoteItem = { firestoreId: docSnap.id, ...docSnap.data() };
      dutyFiles.push(remoteItem);
    });
  } catch (err) {
    console.error('Failed to fetch duty requirement files from Firestore:', err);
  }

  const mergedMap = new Map();
  localDutyFiles.forEach(item => {
    const key = item.firestoreId || item.id;
    mergedMap.set(key, item);
  });
  dutyFiles.forEach(item => {
    const key = item.firestoreId || item.id;
    mergedMap.set(key, item);
  });

  dutyFiles = Array.from(mergedMap.values());

  const studentFiles = dutyFiles.filter(f => f.studentId === currentUser.id);

  if (studentFiles.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No files uploaded yet.</p>';
    return;
  }

  container.innerHTML = '';
  
  // Group files by type
    const groupedFiles = {};
    studentFiles.forEach(file => {
      if (!groupedFiles[file.fileType]) {
        groupedFiles[file.fileType] = [];
      }
      groupedFiles[file.fileType].push(file);
    });

    Object.entries(groupedFiles).forEach(([fileType, files]) => {
      const typeSection = document.createElement('div');
      typeSection.style.marginBottom = '16px';
      
      const typeHeader = document.createElement('h5');
      typeHeader.textContent = `${fileTypeEmojis[fileType]} ${fileType}`;
      typeHeader.style.margin = '12px 0 8px 0';
      typeHeader.style.color = '#333';
      typeSection.appendChild(typeHeader);

      files.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        const uploadDate = new Date(file.uploadDate).toLocaleDateString();
        const fileSizeKB = (file.fileSize / 1024).toFixed(2);

        const submittedFlag = file.submitted ? '<span style="color: #0f9d58; font-weight: 600; margin-left: 8px;">Submitted</span>' : '<span style="color: #d97706; font-weight: 600; margin-left: 8px;">Not Submitted</span>';
        const displayName = (file.fileName || '').replace(/\s*Link$/i, '');
        fileItem.innerHTML = `
          <div class="file-icon">${getFileIcon(file.fileName)}</div>
          <div class="file-info">
            <div class="file-name">${escapeHtml(displayName)}${submittedFlag}</div>
            <div class="file-meta">
              <span>${uploadDate}</span>
              <span>${fileSizeKB} KB</span>
            </div>
          </div>
          <div class="file-actions">
            <button onclick="downloadDutyFile('${file.id}')">⬇️ Download</button>
            ${file.submitted ? '<button disabled style="opacity:0.6;">Submitted</button>' : `<button class="primary" style="background:#0f9d58;" onclick="submitDutyFile('${file.id}')">📤 Submit</button>`}
            <button class="delete" onclick="deleteDutyFile('${file.id}')">Delete</button>
          </div>
        `;
        
        typeSection.appendChild(fileItem);
      });

      container.appendChild(typeSection);
    });
}
window.loadStudentDutyFiles = loadStudentDutyFiles;

async function submitDutyFile(fileId) {
  if (!confirm('Submit this file to instructor for review?')) return;
  const dutyFiles = JSON.parse(localStorage.getItem('dutyRequirementFiles') || '[]');
  const target = dutyFiles.find(f => f.id === fileId);
  if (!target) {
    showNotification('File not found.', 'warning');
    return;
  }
  target.submitted = true;
  target.submittedDate = new Date().toISOString();
  localStorage.setItem('dutyRequirementFiles', JSON.stringify(dutyFiles));

  if (target.firestoreId) {
    try {
      await updateDoc(doc(db, 'dutyRequirements', target.firestoreId), {
        submitted: true,
        submittedDate: target.submittedDate
      });
      showNotification('File submitted and Firestore updated.', 'success');
    } catch (err) {
      console.error('Failed to update submission status in Firestore:', err);
      showNotification('Submitted locally but Firestore update failed.', 'warning');
    }
  } else {
    try {
      const docRef = await addDoc(collection(db, 'dutyRequirements'), target);
      target.firestoreId = docRef.id;
      localStorage.setItem('dutyRequirementFiles', JSON.stringify(dutyFiles));
      showNotification('File submitted and saved to Firestore.', 'success');
    } catch (err) {
      console.error('Failed to add submitted file to Firestore:', err);
      showNotification('Submitted locally but Firestore save failed.', 'warning');
    }
  }

  await loadStudentDutyFiles();
}
window.submitDutyFile = submitDutyFile;

// Delete duty file
function deleteDutyFile(fileId) {
  if (confirm('Are you sure you want to delete this file?')) {
    let dutyFiles = JSON.parse(localStorage.getItem('dutyRequirementFiles') || '[]');
    dutyFiles = dutyFiles.filter(f => f.id !== fileId);
    localStorage.setItem('dutyRequirementFiles', JSON.stringify(dutyFiles));
    loadStudentDutyFiles();
    showNotification('File deleted successfully!', 'info');
  }
}
window.deleteDutyFile = deleteDutyFile;

// Download duty file
function downloadDutyFile(fileId) {
  const dutyFiles = JSON.parse(localStorage.getItem('dutyRequirementFiles') || '[]');
  const file = dutyFiles.find(f => f.id === fileId);
  
  if (!file) {
    showNotification('File not found!', 'warning');
    return;
  }

  // Create download link
  if (file.fileContent) {
    const link = document.createElement('a');
    link.href = file.fileContent;
    link.download = file.fileName;
    link.click();
    showNotification('Downloading...', 'info');
  } else {
    showNotification('File data not available for download!', 'warning');
  }
}
window.downloadDutyFile = downloadDutyFile;

// Load instructor duty view
async function loadInstructorDutyView() {
  const container = document.getElementById('instructorDutyFolders') || document.getElementById('instructorStudentFolders');
  
  if (!container) return;

  try {
    const dutyFiles = JSON.parse(localStorage.getItem('dutyRequirementFiles') || '[]');
    
    // Only show files that have been submitted by the student
    const submittedFiles = dutyFiles.filter(file => file.submitted);

    // Group files by student
    const studentFolders = {};
    submittedFiles.forEach(file => {
      if (!studentFolders[file.studentId]) {
        studentFolders[file.studentId] = {
          studentName: file.studentName,
          studentEmail: file.studentEmail,
          studentId: file.studentId,
          files: []
        };
      }
      studentFolders[file.studentId].files.push(file);
    });

    if (Object.keys(studentFolders).length === 0) {
      container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px; grid-column: 1/-1;">No submissions yet.</p>';
      return;
    }

    container.innerHTML = '';

    Object.values(studentFolders).forEach(folder => {
      const card = document.createElement('div');
      card.className = 'student-folder-card';
      
      const reviewedCount = folder.files.filter(f => f.reviewed).length;
      const totalCount = folder.files.length;

      card.innerHTML = `
        <div class="folder-header">
          <div class="folder-header-icon">📁</div>
          <div class="folder-header-info">
            <h4>${escapeHtml(folder.studentName)}</h4>
            <p>${totalCount} file(s)</p>
          </div>
        </div>
        <div class="folder-content">
          ${folder.files.length === 0 ? '<div class="folder-content-empty">No files uploaded</div>' : ''}
        </div>
      `;

      // Add files to folder
      const folderContent = card.querySelector('.folder-content');
      if (folder.files.length > 0) {
        folderContent.innerHTML = '';
        folder.files.forEach(file => {
          const fileItem = document.createElement('div');
          fileItem.className = 'file-item';
          
          const uploadDate = new Date(file.uploadDate).toLocaleDateString();
          const reviewedBadge = file.reviewed ? `<span class="reviewed-badge">✅ Reviewed</span>` : '';

          fileItem.innerHTML = `
            <div class="file-icon">${getFileIcon(file.fileName)}</div>
            <div class="file-info">
              <div class="file-name">
                ${escapeHtml(file.fileName)}
                ${file.fileType ? `<span class="file-type-badge" style="margin-left: 8px;">${fileTypeEmojis[file.fileType]} ${file.fileType}</span>` : ''}
              </div>
              <div class="file-meta">
                <span>${uploadDate}</span>
                <span>📊 ${(file.fileSize / 1024).toFixed(2)} KB</span>
              </div>
            </div>
            <div class="file-actions">
              <button onclick="downloadDutyFile('${file.id}')">⬇️</button>
            </div>
          `;
          
          folderContent.appendChild(fileItem);
        });
      }

      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'download-btn';
      downloadBtn.textContent = '⬇️ Download All Files';
      downloadBtn.onclick = () => downloadAllStudentFiles(folder.studentId, folder.studentName);
      card.querySelector('.folder-content').appendChild(downloadBtn);

      container.appendChild(card);
    });
  } catch (error) {
    console.error('Error loading instructor duty view:', error);
  }
}
window.loadInstructorDutyView = loadInstructorDutyView;

// Download all student files as individual files
function downloadAllStudentFiles(studentId, studentName) {
  const dutyFiles = JSON.parse(localStorage.getItem('dutyRequirementFiles') || '[]');
  const studentFiles = dutyFiles.filter(f => f.studentId === studentId);
  
  if (studentFiles.length === 0) {
    showNotification('No files to download!', 'warning');
    return;
  }

  studentFiles.forEach((file, index) => {
    setTimeout(() => {
      if (file.fileContent) {
        const link = document.createElement('a');
        link.href = file.fileContent;
        link.download = file.fileName;
        link.click();
      }
    }, index * 500); // Stagger downloads
  });

  showNotification(`Downloading ${studentFiles.length} file(s) from ${escapeHtml(studentName)}...`, 'success');
}
window.downloadAllStudentFiles = downloadAllStudentFiles;

// Search and filter functionality for instructor
function setupDutyRequirementFilters() {
  const searchInput = document.getElementById('dutySearchStudent');
  const filterType = document.getElementById('dutyFilterType');
  
  if (searchInput && filterType) {
    searchInput.addEventListener('input', applyDutyFilters);
    filterType.addEventListener('change', applyDutyFilters);
  }
}

function applyDutyFilters() {
  const searchInput = document.getElementById('dutySearchStudent');
  const filterType = document.getElementById('dutyFilterType');
  const dutyFiles = JSON.parse(localStorage.getItem('dutyRequirementFiles') || '[]');
  
  if (!searchInput || !filterType) return;

  const searchTerm = searchInput.value.toLowerCase();
  const filterValue = filterType.value;

  let filteredFiles = dutyFiles;
  
  if (searchTerm) {
    filteredFiles = filteredFiles.filter(f => 
      f.studentName.toLowerCase().includes(searchTerm) || 
      f.fileName.toLowerCase().includes(searchTerm)
    );
  }

  if (filterValue) {
    filteredFiles = filteredFiles.filter(f => f.fileType === filterValue);
  }

  // Update view with filtered files
  const studentFolders = {};
  filteredFiles.forEach(file => {
    if (!studentFolders[file.studentId]) {
      studentFolders[file.studentId] = {
        studentName: file.studentName,
        studentEmail: file.studentEmail,
        studentId: file.studentId,
        files: []
      };
    }
    studentFolders[file.studentId].files.push(file);
  });

  const container = document.getElementById('instructorStudentFolders');
  if (!container) return;

  if (Object.keys(studentFolders).length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px; grid-column: 1/-1;">No matching submissions found.</p>';
    return;
  }

  container.innerHTML = '';

  Object.values(studentFolders).forEach(folder => {
    const card = document.createElement('div');
    card.className = 'student-folder-card';
    
    const reviewedCount = folder.files.filter(f => f.reviewed).length;
    const totalCount = folder.files.length;

    card.innerHTML = `
      <div class="folder-header">
        <div class="folder-header-icon">📁</div>
        <div class="folder-header-info">
          <h4>${escapeHtml(folder.studentName)}</h4>
          <p>${totalCount} file(s) • ${reviewedCount} reviewed</p>
        </div>
      </div>
      <div class="folder-content">
      </div>
    `;

    const folderContent = card.querySelector('.folder-content');
    folder.files.forEach(file => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      
      const uploadDate = new Date(file.uploadDate).toLocaleDateString();

      fileItem.innerHTML = `
        <div class="file-icon">${getFileIcon(file.fileName)}</div>
        <div class="file-info">
          <div class="file-name">
            ${escapeHtml(file.fileName)}
            <span class="file-type-badge" style="margin-left: 8px;">${fileTypeEmojis[file.fileType]} ${file.fileType}</span>
          </div>
          <div class="file-meta">
            <span>${uploadDate}</span>
            <span>📊 ${(file.fileSize / 1024).toFixed(2)} KB</span>
          </div>
        </div>
        <div class="file-actions">
          <button onclick="downloadDutyFile('${file.id}')">⬇️</button>
        </div>
      `;
      
      folderContent.appendChild(fileItem);
    });

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'download-btn';
    downloadBtn.textContent = '⬇️ Download All Files';
    downloadBtn.onclick = () => downloadAllStudentFiles(folder.studentId, folder.studentName);
    folderContent.appendChild(downloadBtn);

    container.appendChild(card);
  });
}
window.applyDutyFilters = applyDutyFilters;

// Initialize duty requirement feature
function initializeDutyRequirement() {
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
  const studentView = document.getElementById('studentDutyView');
  const instructorView = document.getElementById('instructorDutyView');
  
  if (!studentView || !instructorView) return;

  // Hook submit button once during initialization
  const submitDutyLinkBtn = document.getElementById('submitDutyLinkBtn');
  if (submitDutyLinkBtn) {
    submitDutyLinkBtn.removeEventListener('click', submitDutyLink);
    submitDutyLinkBtn.addEventListener('click', submitDutyLink);
  }

  if (currentUser.role === 'student') {
    studentView.style.display = 'block';
    instructorView.style.display = 'none';
    loadStudentDutyFiles();
  } else if (currentUser.role === 'instructor') {
    studentView.style.display = 'none';
    instructorView.style.display = 'block';
    loadInstructorDutyView();
    setupDutyRequirementFilters();
  }
}
window.initializeDutyRequirement = initializeDutyRequirement;
