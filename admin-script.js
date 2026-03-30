import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, deleteDoc, updateDoc, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

const usersCollection = collection(db, 'users');
let adminData = {
  students: [],
  instructors: [],
  schedules: [],
  demonstrations: [],
  labs: [],
  announcements: []
};
let instructorUsers = [];
let studentUsers = [];

// INSTRUCTORS MANAGEMENT
async function updateInstructors() {
  const tbody = document.getElementById('instructorTableBody');
  tbody.innerHTML = '';

  if (instructorUsers.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No instructors found</td></tr>';
    return;
  }

  instructorUsers.forEach(instructor => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${instructor.instructorId || instructor.uid}</td>
      <td>${instructor.name}</td>
      <td>${instructor.email}</td>
      <td><span class="status-badge status-${(instructor.status || 'active').toLowerCase()}">${instructor.status || 'Active'}</span></td>
      <td>
        <button class="btn btn-edit" onclick="openEditInstructorModal('${instructor.uid}')">Edit</button>
        <button class="btn btn-delete" onclick="deleteInstructor('${instructor.uid}')">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function openEditInstructorModal(uid) {
  const instructor = instructorUsers.find(i => i.uid === uid);
  if (!instructor) return;
  document.getElementById('editInstructorId').value = instructor.uid;
  document.getElementById('editInstructorName').value = instructor.name || '';
  document.getElementById('editInstructorEmail').value = instructor.email || '';
  document.getElementById('editInstructorStatus').value = instructor.status || 'Active';
  document.getElementById('editInstructorModal').classList.add('show');
}

async function updateInstructor(event) {
  event.preventDefault();
  const uid = document.getElementById('editInstructorId').value;
  const name = document.getElementById('editInstructorName').value.trim();
  const email = document.getElementById('editInstructorEmail').value.trim();
  const status = document.getElementById('editInstructorStatus').value;

  if (!uid || !name || !email) {
    showNotification('❌ Please fill in all fields.', 'error');
    return;
  }

  try {
    await updateDoc(doc(db, 'users', uid), {
      name,
      email,
      status
    });
    await loadFirebaseUsers();
    closeModal('editInstructorModal');
    showNotification('✅ Instructor updated successfully!', 'success');
  } catch (error) {
    console.error('Failed to update instructor:', error);
    showNotification('❌ Failed to update instructor.', 'error');
  }
}

async function deleteInstructor(instructorUid) {
  if (!confirm('Are you sure you want to delete this instructor?')) return;

  try {
    await deleteDoc(doc(db, 'users', instructorUid));
    showNotification('✅ Instructor deleted successfully!', 'success');
    await loadFirebaseUsers();
  } catch (error) {
    console.error('Failed to delete instructor:', error);
    showNotification('❌ Failed to delete instructor.', 'error');
  }
}

function filterInstructors() {
  const searchTerm = document.getElementById('instructorSearch').value.toLowerCase();
  const tbody = document.getElementById('instructorTableBody');
  const rows = tbody.querySelectorAll('tr:not(.empty-row)');
  rows.forEach(row => {
    const name = row.cells[1].textContent.toLowerCase();
    const email = row.cells[2].textContent.toLowerCase();
    if (name.includes(searchTerm) || email.includes(searchTerm)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

// Initialize admin panel on page load
document.addEventListener('DOMContentLoaded', async function() {
  loadDataFromStorage();
  await loadFirebaseUsers();
  displayAdminInfo();
  initializeSelectOptions();
  updateDashboard();
  showAdminSection('dashboard');
  setActiveNavLink('dashboard');
});

async function loadFirebaseUsers() {
  try {
    const instructorQuery = query(usersCollection, where('role', '==', 'instructor'));
    const studentQuery = query(usersCollection, where('role', '==', 'student'));
    const [instructorSnapshot, studentSnapshot] = await Promise.all([getDocs(instructorQuery), getDocs(studentQuery)]);

    instructorUsers = instructorSnapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
    studentUsers = studentSnapshot.docs.map(d => ({ uid: d.id, ...d.data() }));

    updateInstructors();
    loadStudents();
    initializeSelectOptions();
  } catch (error) {
    console.error('Failed to load Firestore users:', error);
  }
}

// Display admin info from logged-in user
function displayAdminInfo() {
  const currentUser = localStorage.getItem('currentUser');
  if (currentUser) {
    const user = JSON.parse(currentUser);
    const adminInfoElement = document.querySelector('.admin-info');
    if (adminInfoElement) {
      adminInfoElement.textContent = '👤 ' + user.name;
    }
  }
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/[&<>"]/g, function (m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;'
    }[m];
  });
}

// Load data from localStorage
function loadDataFromStorage() {
  const savedData = localStorage.getItem('nursingHubAdminData');
  if (savedData) {
    adminData = JSON.parse(savedData);
  }
}

// Save data to localStorage
function saveDataToStorage() {
  localStorage.setItem('nursingHubAdminData', JSON.stringify(adminData));
}

// Show admin section
function showAdminSection(sectionId) {
  // Hide all sections
  const sections = document.querySelectorAll('.admin-section');
  sections.forEach(s => s.classList.remove('active'));
  
  // Show selected section
  const section = document.getElementById(sectionId);
  if (section) {
    section.classList.add('active');
  }
  
  // Update active nav link
  setActiveNavLink(sectionId);
  
  // Load relevant data
  switch(sectionId) {
    case 'students':
      loadStudents();
      break;
    case 'instructors':
      updateInstructors();
      break;
    case 'announcements':
      loadAnnouncements();
      break;
  }
}

// Set active nav link
function setActiveNavLink(sectionId) {
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.onclick && link.onclick.toString().includes(sectionId)) {
      link.classList.add('active');
    }
  });
}

// Dashboard
function updateDashboard() {
  const totalStudentsEl = document.getElementById('totalStudents');
  if (totalStudentsEl) totalStudentsEl.textContent = studentUsers.length || 0;
  const totalInstructorsEl = document.getElementById('totalInstructors');
  if (totalInstructorsEl) totalInstructorsEl.textContent = instructorUsers.length || 0;
  loadRecentActivities();
}

function loadRecentActivities() {
  const recentList = document.getElementById('recentList');
  recentList.innerHTML = '';

  const activities = studentUsers.map(student => ({
    type: 'Student Account',
    description: `${student.name || 'Unnamed Student'} created`,
    date: student.createdAt || student.enrollmentDate || ''
  }));

  if (activities.length === 0) {
    recentList.innerHTML = '<p class="empty-state">No recent activities</p>';
    return;
  }

  activities.slice(-5).reverse().forEach(activity => {
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.innerHTML = `<strong>${activity.type}</strong><br>${activity.description}<br><small>${activity.date || ''}</small>`;
    recentList.appendChild(item);
  });
}

// STUDENTS MANAGEMENT
function initializeSelectOptions() {
  updateStudentSelects();
}

function updateStudentSelects() {
  // Keep compatible with removed schedule/demo/lab UI.
  // No-op unless select inputs exist in current UI.
  const selects = ['scheduleStudent', 'demoStudent', 'labStudent'];
  const source = studentUsers.length > 0 ? studentUsers : adminData.students;
  selects.forEach(selectId => {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">-- Select Student --</option>';
    source.forEach(student => {
      const option = document.createElement('option');
      option.value = student.studentId || student.id || student.uid || '';
      option.textContent = student.name || 'Unknown';
      select.appendChild(option);
    });
  });
}

// GOOGLE FORM SUBMISSIONS
async function createStudentFromForm(event) {
  event.preventDefault();

  const name = document.getElementById('formStudentName').value.trim();
  const email = document.getElementById('formStudentEmail').value.trim();
  const studentId = document.getElementById('formStudentId').value.trim();
  const password = document.getElementById('formStudentPassword').value;
  const status = document.getElementById('formStudentStatus').value;

  if (!name || !email || !studentId || !password) {
    showNotification('❌ Please fill in all fields', 'error');
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;
    const newStudent = {
      uid,
      name,
      email,
      role: 'student',
      studentId,
      enrollmentDate: new Date().toISOString().split('T')[0],
      status,
      createdAt: serverTimestamp()
    };
    await setDoc(doc(db, 'users', uid), newStudent);

    studentUsers.push(newStudent);
    showNotification(`✅ Student account created for ${name}!`, 'success');
    document.querySelector('#googleform form').reset();
    loadStudents();
    updateStudentSelects();
    updateDashboard();
    showAdminSection('students');
    restoreAdminSession().then(() => loadFirebaseUsers()).catch(() => {});
  } catch (error) {
    console.error('Student creation failed:', error);
    let message = 'Failed to create student account. Please try again.';
    if (error?.code === 'auth/email-already-in-use') {
      message = 'Email is already registered. If this is your student account, use password recovery or contact admin.';
    } else if (error?.code === 'auth/invalid-email') {
      message = 'Invalid email address format.';
    } else if (error?.code === 'auth/weak-password') {
      message = 'Password is too weak. Use at least 6 characters.';
    }
    showNotification(`❌ ${message}`, 'error');
  }
}

async function restoreAdminSession() {
  const adminCreds = JSON.parse(localStorage.getItem('adminCredentials') || 'null');
  if (!adminCreds || !adminCreds.email || !adminCreds.password) {
    console.warn('Admin credentials are missing after account creation. Please sign in again.');
    showNotification('⚠️ Admin credentials missing after create. Please log out and log in again.', 'error');
    return;
  }

  try {
    await signOut(auth);
    await signInWithEmailAndPassword(auth, adminCreds.email, adminCreds.password);
  } catch (error) {
    console.error('Failed to restore admin session:', error);
    showNotification('⚠️ Created user, but failed to restore admin session. Please login again.', 'error');
  }
}

async function createInstructorFromForm(event) {
  event.preventDefault();
  const name = document.getElementById('formInstructorName').value.trim();
  const email = document.getElementById('formInstructorEmail').value.trim();
  const instructorId = document.getElementById('formInstructorId').value.trim();
  const password = document.getElementById('formInstructorPassword').value;
  const status = document.getElementById('formInstructorStatus').value;

  if (!name || !email || !instructorId || !password) {
    showNotification('❌ Please fill in all fields', 'error');
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;
    const newInstructor = {
      uid,
      name,
      email,
      role: 'instructor',
      instructorId,
      status,
      createdAt: serverTimestamp()
    };
    await setDoc(doc(db, 'users', uid), newInstructor);

    instructorUsers.push(newInstructor);
    showNotification(`✅ Instructor account created for ${name}!`, 'success');
    document.querySelector('#addinstructor form').reset();
    updateInstructors();
    showAdminSection('instructors');
    restoreAdminSession().then(() => loadFirebaseUsers()).catch(() => {});
  } catch (error) {
    console.error('Instructor creation failed:', error);
    const message = error?.code === 'auth/email-already-in-use'
      ? 'Email is already registered.'
      : `Failed to create instructor account. ${error.message || ''}`;
    showNotification(`❌ ${message}`, 'error');
  }
}

function loadStudents() {
  const tbody = document.getElementById('studentTableBody');
  tbody.innerHTML = '';
  
  if (studentUsers.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No students found</td></tr>';
    return;
  }
  
  studentUsers.forEach(student => {
    const row = document.createElement('tr');
    const displayId = student.studentId || student.uid || student.id || 'N/A';
    const rowStatus = student.status || 'Active';
    const enrollment = student.enrollmentDate ? new Date(student.enrollmentDate).toLocaleDateString() : 'N/A';
    row.innerHTML = `
      <td>${displayId}</td>
      <td>${student.name || 'Unknown'}</td>
      <td>${student.email || 'Unknown'}</td>
      <td>${enrollment}</td>
      <td><span class="status-badge status-${rowStatus.toLowerCase()}">${rowStatus}</span></td>
      <td>
        <button class="btn btn-edit" onclick="openEditStudentModal('${student.uid}')">Edit</button>
        <button class="btn btn-delete" onclick="deleteStudent('${student.uid}')">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function openEditStudentModal(studentId) {
  const student = studentUsers.find(s => s.studentId === studentId || s.uid === studentId);
  if (!student) return;

  document.getElementById('editStudentId').value = student.uid || student.studentId;
  document.getElementById('editStudentName').value = student.name;
  document.getElementById('editStudentEmail').value = student.email;
  document.getElementById('editStudentEnrollment').value = student.enrollmentDate || '';
  document.getElementById('editStudentStatus').value = student.status || 'Active';
  document.getElementById('editStudentModal').classList.add('show');
}

async function updateStudent(event) {
  event.preventDefault();
  const uid = document.getElementById('editStudentId').value;
  const studentDoc = doc(db, 'users', uid);

  try {
    await updateDoc(studentDoc, {
      name: document.getElementById('editStudentName').value,
      email: document.getElementById('editStudentEmail').value,
      enrollmentDate: document.getElementById('editStudentEnrollment').value,
      status: document.getElementById('editStudentStatus').value
    });
    closeModal('editStudentModal');
    await loadFirebaseUsers();
    showNotification('✅ Student updated successfully!', 'success');
  } catch (error) {
    console.error('Failed to update student:', error);
    showNotification('❌ Failed to update student.', 'error');
  }
}

async function deleteStudent(studentId) {
  if (!confirm('Are you sure you want to delete this student?')) return;

  try {
    await deleteDoc(doc(db, 'users', studentId));
    await loadFirebaseUsers();
    showNotification('✅ Student deleted successfully!', 'success');
  } catch (error) {
    console.error('Failed to delete student:', error);
    showNotification('❌ Failed to delete student.', 'error');
  }
}

function filterStudents() {
  const searchTerm = document.getElementById('studentSearch').value.toLowerCase();
  const tbody = document.getElementById('studentTableBody');
  const rows = tbody.querySelectorAll('tr:not(.empty-row)');
  
  rows.forEach(row => {
    const name = row.cells[1].textContent.toLowerCase();
    const email = row.cells[2].textContent.toLowerCase();
    
    if (name.includes(searchTerm) || email.includes(searchTerm)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

// DUTY SCHEDULES
function openAddScheduleModal() {
  document.getElementById('addScheduleModal').classList.add('show');
}

async function addSchedule(event) {
  event.preventDefault();

  const studentId = document.getElementById('scheduleStudent').value;
  const student = studentUsers.find(s => s.uid === studentId || s.studentId === studentId);
  if (!student) {
    showNotification('❌ Please select a valid student.', 'error');
    return;
  }

  const schedule = {
    id: 'SCH-' + Date.now(),
    studentId: student.uid,
    studentLegacyId: student.studentId || student.id || '',
    studentName: student.name || 'Unknown Student',
    hospital: document.getElementById('scheduleHospital').value,
    ward: document.getElementById('scheduleWard').value,
    date: document.getElementById('scheduleDate').value,
    shift: document.getElementById('scheduleShift').value,
    instructor: document.getElementById('scheduleInstructor').value || 'TBD'
  };

  adminData.schedules.push(schedule);
  saveDataToStorage();
  updateDashboard();
  closeModal('addScheduleModal');
  document.querySelector('#addScheduleModal form').reset();

  try {
    await addDoc(collection(db, 'schedules'), {
      ...schedule,
      createdAt: serverTimestamp()
    });
    showNotification(`✅ Schedule for "${student.name}" added successfully and synced!`, 'success');
  } catch (error) {
    console.error('Failed to sync schedule to Firestore:', error);
    showNotification('✅ Schedule saved locally, but Firestore sync failed.', 'warning');
  }

  loadSchedules();
}

function loadSchedules() {
  const tbody = document.getElementById('scheduleTableBody');
  tbody.innerHTML = '';
  
  if (adminData.schedules.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No schedules found</td></tr>';
    return;
  }
  
  adminData.schedules.forEach(schedule => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${schedule.studentName}</td>
      <td>${schedule.hospital}</td>
      <td>${schedule.ward}</td>
      <td>${new Date(schedule.date).toLocaleDateString()}</td>
      <td>${schedule.shift}</td>
      <td>${schedule.instructor}</td>
      <td>
        <button class="btn btn-edit" onclick="openEditScheduleModal('${schedule.id}')">Edit</button>
        <button class="btn btn-delete" onclick="deleteSchedule('${schedule.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
  
  // Update hospital filter
  const filters = [...new Set(adminData.schedules.map(s => s.hospital))];
  const filterSelect = document.getElementById('scheduleFilter');
  const currentValue = filterSelect.value;
  filterSelect.innerHTML = '<option value="">All Hospitals</option>';
  filters.forEach(hospital => {
    const option = document.createElement('option');
    option.value = hospital;
    option.textContent = hospital;
    filterSelect.appendChild(option);
  });
  filterSelect.value = currentValue;
}

function openEditScheduleModal(scheduleId) {
  const schedule = adminData.schedules.find(s => s.id === scheduleId);
  if (!schedule) return;
  
  document.getElementById('editScheduleId').value = schedule.id;
  document.getElementById('editScheduleHospital').value = schedule.hospital;
  document.getElementById('editScheduleWard').value = schedule.ward;
  document.getElementById('editScheduleDate').value = schedule.date;
  document.getElementById('editScheduleShift').value = schedule.shift;
  document.getElementById('editScheduleInstructor').value = schedule.instructor;
  
  document.getElementById('editScheduleModal').classList.add('show');
}

function updateSchedule(event) {
  event.preventDefault();
  
  const scheduleId = document.getElementById('editScheduleId').value;
  const schedule = adminData.schedules.find(s => s.id === scheduleId);
  
  if (!schedule) return;
  
  schedule.hospital = document.getElementById('editScheduleHospital').value;
  schedule.ward = document.getElementById('editScheduleWard').value;
  schedule.date = document.getElementById('editScheduleDate').value;
  schedule.shift = document.getElementById('editScheduleShift').value;
  schedule.instructor = document.getElementById('editScheduleInstructor').value;
  
  saveDataToStorage();
  closeModal('editScheduleModal');
  loadSchedules();
  showNotification('✅ Schedule updated successfully!', 'success');
}

function deleteSchedule(scheduleId) {
  if (confirm('Delete this schedule?')) {
    adminData.schedules = adminData.schedules.filter(s => s.id !== scheduleId);
    saveDataToStorage();
    updateDashboard();
    loadSchedules();
    showNotification('✅ Schedule deleted!', 'success');
  }
}

function filterSchedules() {
  const filterValue = document.getElementById('scheduleFilter').value.toLowerCase();
  const tbody = document.getElementById('scheduleTableBody');
  const rows = tbody.querySelectorAll('tr:not(.empty-row)');
  
  rows.forEach(row => {
    const hospital = row.cells[1].textContent.toLowerCase();
    
    if (filterValue === '' || hospital.includes(filterValue)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

// DEMONSTRATIONS
function openAddDemoModal() {
  document.getElementById('addDemoModal').classList.add('show');
}

function addDemo(event) {
  event.preventDefault();
  
  const studentId = document.getElementById('demoStudent').value;
  const student = adminData.students.find(s => s.id === studentId);
  
  const demo = {
    id: 'DEMO-' + Date.now(),
    studentId: studentId,
    studentName: student.name,
    procedure: document.getElementById('demoProcedure').value,
    date: document.getElementById('demoDate').value,
    grade: document.getElementById('demoGrade').value,
    feedback: document.getElementById('demoFeedback').value,
    instructor: document.getElementById('demoInstructor').value
  };
  
  adminData.demonstrations.push(demo);
  saveDataToStorage();
  updateDashboard();
  closeModal('addDemoModal');
  document.querySelector('#addDemoModal form').reset();
  
  showNotification(`✅ Demonstration for "${student.name}" recorded!`, 'success');
  loadDemonstrations();
}

function loadDemonstrations() {
  const tbody = document.getElementById('demoTableBody');
  tbody.innerHTML = '';
  
  if (adminData.demonstrations.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No demonstrations found</td></tr>';
    return;
  }
  
  adminData.demonstrations.forEach(demo => {
    const row = document.createElement('tr');
    const gradeClass = demo.grade >= 80 ? 'status-passed' : (demo.grade >= 70 ? 'status-pending' : 'status-failed');
    row.innerHTML = `
      <td>${demo.studentName}</td>
      <td>${demo.procedure}</td>
      <td>${new Date(demo.date).toLocaleDateString()}</td>
      <td><span class="status-badge ${gradeClass}">${demo.grade}%</span></td>
      <td>${demo.feedback || 'N/A'}</td>
      <td>${demo.instructor}</td>
      <td>
        <button class="btn btn-edit" onclick="openEditDemoModal('${demo.id}')">Edit</button>
        <button class="btn btn-delete" onclick="deleteDemo('${demo.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
  
  // Update procedure filter
  const procedures = [...new Set(adminData.demonstrations.map(d => d.procedure))];
  const filterSelect = document.getElementById('demoFilter');
  const currentValue = filterSelect.value;
  filterSelect.innerHTML = '<option value="">All Procedures</option>';
  procedures.forEach(procedure => {
    const option = document.createElement('option');
    option.value = procedure;
    option.textContent = procedure;
    filterSelect.appendChild(option);
  });
  filterSelect.value = currentValue;
}

function openEditDemoModal(demoId) {
  const demo = adminData.demonstrations.find(d => d.id === demoId);
  if (!demo) return;
  
  document.getElementById('editDemoId').value = demo.id;
  document.getElementById('editDemoProcedure').value = demo.procedure;
  document.getElementById('editDemoDate').value = demo.date;
  document.getElementById('editDemoGrade').value = demo.grade;
  document.getElementById('editDemoFeedback').value = demo.feedback;
  document.getElementById('editDemoInstructor').value = demo.instructor;
  
  document.getElementById('editDemoModal').classList.add('show');
}

function updateDemo(event) {
  event.preventDefault();
  
  const demoId = document.getElementById('editDemoId').value;
  const demo = adminData.demonstrations.find(d => d.id === demoId);
  
  if (!demo) return;
  
  demo.procedure = document.getElementById('editDemoProcedure').value;
  demo.date = document.getElementById('editDemoDate').value;
  demo.grade = document.getElementById('editDemoGrade').value;
  demo.feedback = document.getElementById('editDemoFeedback').value;
  demo.instructor = document.getElementById('editDemoInstructor').value;
  
  saveDataToStorage();
  closeModal('editDemoModal');
  loadDemonstrations();
  showNotification('✅ Demonstration updated successfully!', 'success');
}

function deleteDemo(demoId) {
  if (confirm('Delete this demonstration?')) {
    adminData.demonstrations = adminData.demonstrations.filter(d => d.id !== demoId);
    saveDataToStorage();
    updateDashboard();
    loadDemonstrations();
    showNotification('✅ Demonstration deleted!', 'success');
  }
}

function filterDemos() {
  const filterValue = document.getElementById('demoFilter').value.toLowerCase();
  const tbody = document.getElementById('demoTableBody');
  const rows = tbody.querySelectorAll('tr:not(.empty-row)');
  
  rows.forEach(row => {
    const procedure = row.cells[1].textContent.toLowerCase();
    
    if (filterValue === '' || procedure.includes(filterValue)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

// LABORATORY TESTS
function openAddLabModal() {
  document.getElementById('addLabModal').classList.add('show');
}

function addLab(event) {
  event.preventDefault();
  
  const studentId = document.getElementById('labStudent').value;
  const student = adminData.students.find(s => s.id === studentId);
  
  const lab = {
    id: 'LAB-' + Date.now(),
    studentId: studentId,
    studentName: student.name,
    testName: document.getElementById('labTestName').value,
    date: document.getElementById('labDate').value,
    result: document.getElementById('labResult').value,
    status: document.getElementById('labStatus').value,
    notes: document.getElementById('labNotes').value
  };
  
  adminData.labs.push(lab);
  saveDataToStorage();
  updateDashboard();
  closeModal('addLabModal');
  document.querySelector('#addLabModal form').reset();
  
  showNotification(`✅ Lab test for "${student.name}" recorded!`, 'success');
  loadLabs();
}

function loadLabs() {
  const tbody = document.getElementById('labTableBody');
  tbody.innerHTML = '';
  
  if (adminData.labs.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No lab tests found</td></tr>';
    return;
  }
  
  adminData.labs.forEach(lab => {
    const row = document.createElement('tr');
    const statusClass = `status-${lab.status.toLowerCase()}`;
    row.innerHTML = `
      <td>${lab.studentName}</td>
      <td>${lab.testName}</td>
      <td>${new Date(lab.date).toLocaleDateString()}</td>
      <td>${lab.result}</td>
      <td><span class="status-badge ${statusClass}">${lab.status}</span></td>
      <td>${lab.notes || 'N/A'}</td>
      <td>
        <button class="btn btn-edit" onclick="openEditLabModal('${lab.id}')">Edit</button>
        <button class="btn btn-delete" onclick="deleteLab('${lab.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
  
  // Update test filter
  const tests = [...new Set(adminData.labs.map(l => l.testName))];
  const filterSelect = document.getElementById('labFilter');
  const currentValue = filterSelect.value;
  filterSelect.innerHTML = '<option value="">All Tests</option>';
  tests.forEach(test => {
    const option = document.createElement('option');
    option.value = test;
    option.textContent = test;
    filterSelect.appendChild(option);
  });
  filterSelect.value = currentValue;
}

function openEditLabModal(labId) {
  const lab = adminData.labs.find(l => l.id === labId);
  if (!lab) return;
  
  document.getElementById('editLabId').value = lab.id;
  document.getElementById('editLabTestName').value = lab.testName;
  document.getElementById('editLabDate').value = lab.date;
  document.getElementById('editLabResult').value = lab.result;
  document.getElementById('editLabStatus').value = lab.status;
  document.getElementById('editLabNotes').value = lab.notes;
  
  document.getElementById('editLabModal').classList.add('show');
}

function updateLab(event) {
  event.preventDefault();
  
  const labId = document.getElementById('editLabId').value;
  const lab = adminData.labs.find(l => l.id === labId);
  
  if (!lab) return;
  
  lab.testName = document.getElementById('editLabTestName').value;
  lab.date = document.getElementById('editLabDate').value;
  lab.result = document.getElementById('editLabResult').value;
  lab.status = document.getElementById('editLabStatus').value;
  lab.notes = document.getElementById('editLabNotes').value;
  
  saveDataToStorage();
  closeModal('editLabModal');
  loadLabs();
  showNotification('✅ Lab test updated successfully!', 'success');
}

function deleteLab(labId) {
  if (confirm('Delete this lab test?')) {
    adminData.labs = adminData.labs.filter(l => l.id !== labId);
    saveDataToStorage();
    updateDashboard();
    loadLabs();
    showNotification('✅ Lab test deleted!', 'success');
  }
}

function filterLabs() {
  const filterValue = document.getElementById('labFilter').value.toLowerCase();
  const tbody = document.getElementById('labTableBody');
  const rows = tbody.querySelectorAll('tr:not(.empty-row)');
  
  rows.forEach(row => {
    const testName = row.cells[1].textContent.toLowerCase();
    
    if (filterValue === '' || testName.includes(filterValue)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

// ANNOUNCEMENTS
function openAddAnnouncementModal() {
  document.getElementById('addAnnouncementModal').classList.add('show');
}

async function addAnnouncement(event) {
  event.preventDefault();

  const title = document.getElementById('announcementTitle').value.trim();
  const message = document.getElementById('announcementMessage').value.trim();
  const priority = document.getElementById('announcementPriority').value;

  if (!title || !message) {
    showNotification('Please provide title and message for the announcement.', 'warning');
    return;
  }

  try {
    await addDoc(collection(db, 'forum'), {
      type: 'announcement',
      title,
      message,
      priority,
      createdAt: serverTimestamp(),
      authorName: 'Admin',
      role: 'admin'
    });

    closeModal('addAnnouncementModal');
    document.querySelector('#addAnnouncementModal form').reset();
    showNotification('✅ Announcement posted successfully!', 'success');
    await loadAnnouncements();
  } catch (error) {
    console.error('Failed to post announcement:', error);
    showNotification('❌ Failed to post announcement.', 'error');
  }
}

async function loadAnnouncements() {
  const container = document.getElementById('announcementsList');
  container.innerHTML = '<p class="empty-state">Loading announcements...</p>';

  try {
    const snapshot = await getDocs(query(collection(db, 'forum'), orderBy('createdAt', 'desc')));
    const announcements = snapshot.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .filter(item => item.type === 'announcement');

    if (announcements.length === 0) {
      container.innerHTML = '<p class="empty-state">No announcements posted</p>';
      return;
    }

    container.innerHTML = '';
    announcements.forEach(announcement => {
      const createdAt = announcement.createdAt?.toDate ? announcement.createdAt.toDate() : new Date(announcement.createdAt || Date.now());
      const card = document.createElement('div');
      card.className = 'announcement-card';
      card.innerHTML = `
        <h3>${escapeHtml(announcement.title)}</h3>
        <p>${escapeHtml(announcement.message)}</p>
        <div class="announcement-meta">
          <span class="announcement-priority priority-${escapeHtml((announcement.priority || 'Normal').toLowerCase())}">${escapeHtml(announcement.priority || 'Normal')}</span>
          <span>${createdAt.toLocaleString()}</span>
          <button class="btn btn-delete" style="margin-left: auto;" onclick="deleteAnnouncement('${announcement.id}')">Delete</button>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (error) {
    console.error('Failed to load announcements:', error);
    container.innerHTML = '<p class="empty-state">Unable to load announcements</p>';
  }
}

async function deleteAnnouncement(announcementId) {
  if (!confirm('Delete this announcement?')) return;

  try {
    await deleteDoc(doc(db, 'forum', announcementId));
    showNotification('✅ Announcement deleted!', 'success');
    await loadAnnouncements();
  } catch (error) {
    console.error('Failed to delete announcement:', error);
    showNotification('❌ Failed to delete announcement.', 'error');
  }
}

// REPORTS
function generatePerformanceReport() {
  alert('Performance Report:\n\nThis would generate a detailed performance report for all students with their grades and progress.');
}

function generateScheduleReport() {
  alert('Schedule Report:\n\nTotal Assignments: ' + adminData.schedules.length + '\n\nThis would show all clinical duty assignments and attendance.');
}

function generateEnrollmentReport() {
  alert('Enrollment Report:\n\nTotal Students: ' + adminData.students.length + '\n\nActive: ' + adminData.students.filter(s => s.status === 'Active').length);
}

// MODAL FUNCTIONS
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('show');
}

// Close modal when clicking outside
window.onclick = function(event) {
  if (event.target.classList.contains('modal')) {
    event.target.classList.remove('show');
  }
};

// UTILITY FUNCTIONS
function showNotification(message, type) {
  // Create a simple notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    background-color: ${type === 'success' ? '#27ae60' : (type === 'error' ? '#e74c3c' : '#3498db')};
    color: white;
    border-radius: 6px;
    z-index: 2000;
    animation: slideIn 0.3s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Logout function
function logout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('loginTime');
    window.location.href = 'login.html';
  }
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Expose functions to global scope for inline HTML handlers
window.logout = logout;
window.showAdminSection = showAdminSection;
window.createInstructorFromForm = createInstructorFromForm;
window.createStudentFromForm = createStudentFromForm;
window.updateInstructor = updateInstructor;
window.openEditInstructorModal = openEditInstructorModal;
window.openEditStudentModal = openEditStudentModal;
window.updateStudent = updateStudent;
window.deleteInstructor = deleteInstructor;
window.deleteStudent = deleteStudent;
window.openAddScheduleModal = openAddScheduleModal;
window.filterSchedules = filterSchedules;
window.openAddDemoModal = openAddDemoModal;
window.filterDemos = filterDemos;
window.openAddLabModal = openAddLabModal;
window.filterLabs = filterLabs;
window.openAddAnnouncementModal = openAddAnnouncementModal;
window.addAnnouncement = addAnnouncement;
window.deleteAnnouncement = deleteAnnouncement;
window.generatePerformanceReport = generatePerformanceReport;
window.generateScheduleReport = generateScheduleReport;
window.generateEnrollmentReport = generateEnrollmentReport;
window.closeModal = closeModal;
window.openModal = (id) => document.getElementById(id).classList.add('show');

// Keep compatibility if modules are not exposing inline handlers by default
window.updateInstructors = updateInstructors;
window.loadStudents = loadStudents;
window.updateStudentSelects = updateStudentSelects;
