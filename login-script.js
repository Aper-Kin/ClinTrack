import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signOut } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

async function getUserProfile(uid) {
  if (!uid) return null;
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (!userSnap.exists()) return null;
    return { uid: userSnap.id, ...userSnap.data() };
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

async function createUserProfile(uid, email, role, name = '') {
  if (!uid || !email || !role) return;
  try {
    await setDoc(doc(db, 'users', uid), {
      name: name || email.split('@')[0] || 'User',
      email,
      role,
      status: 'Active',
      createdAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    console.error('Failed to create user profile:', error);
  }
}

async function ensureDefaultAdmin() {
  const email = 'admin@nursing.edu';
  const password = 'admin123';

  try {
    // Try to sign in first
    const signInResponse = await signInWithEmailAndPassword(auth, email, password);
    
    // Check if profile exists and has correct role
    let profile = await getUserProfile(signInResponse.user.uid);
    if (!profile || profile.role !== 'admin') {
      await createUserProfile(signInResponse.user.uid, email, 'admin', 'System Administrator');
    }
    
    await signOut(auth);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      try {
        // Create new admin account
        const newAdmin = await createUserWithEmailAndPassword(auth, email, password);
        await createUserProfile(newAdmin.user.uid, email, 'admin', 'System Administrator');
        await signOut(auth);
      } catch (createError) {
        console.error('Default admin creation failed:', createError);
      }
    } else {
      // If sign in failed for other reasons, try to create the account
      try {
        const newAdmin = await createUserWithEmailAndPassword(auth, email, password);
        await createUserProfile(newAdmin.user.uid, email, 'admin', 'System Administrator');
        await signOut(auth);
      } catch (createError) {
        console.error('Admin account setup failed:', createError);
      }
    }
  }
}

function redirectToRolePage(role) {
  if (role === 'student') return window.location.href = 'index.html';
  if (role === 'instructor') return window.location.href = 'instructor.html';
  if (role === 'admin') return window.location.href = 'admin.html';
  return window.location.href = 'login.html';
}

function showErrorMessage(message, formId) {
  const form = document.getElementById(formId);
  let errorDiv = form.querySelector('.error-message');
  if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    form.insertBefore(errorDiv, form.firstChild);
  }
  errorDiv.textContent = '❌ ' + message;
  errorDiv.style.display = 'block';
}

function showSuccessMessage(message, formId) {
  const form = document.getElementById(formId);
  let successDiv = form.querySelector('.success-message');
  if (!successDiv) {
    successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    form.insertBefore(successDiv, form.firstChild);
  }
  successDiv.textContent = '✅ ' + message;
  successDiv.style.display = 'block';
}

function clearErrorMessage() {
  const errorDivs = document.querySelectorAll('.error-message, .success-message');
  errorDivs.forEach(div => div.style.display = 'none');
}

let loginInProgress = false;

async function handleLogin(event) {
  event.preventDefault();
  clearErrorMessage();
  loginInProgress = true;

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const role = document.getElementById('loginRole').value;

  if (!email || !password || !role) {
    showErrorMessage('Please fill in all fields', 'loginForm');
    loginInProgress = false;
    return;
  }

  try {
    // Ensure fresh sign-in session to enforce selected role validation
    if (auth.currentUser) {
      await signOut(auth);
      localStorage.removeItem('currentUser');
    }

    const credential = await signInWithEmailAndPassword(auth, email, password);
    let profile = await getUserProfile(credential.user.uid);
    
    // Only create profile for admin account if it doesn't exist
    if (email === 'admin@nursing.edu') {
      if (!profile) {
        await createUserProfile(credential.user.uid, email, 'admin', 'System Administrator');
        profile = await getUserProfile(credential.user.uid);
      }
    }

    if (!profile) {
      showErrorMessage('Account not found. Please contact your administrator to create your account.', 'loginForm');
      return;
    }

    // Strict role validation - selected role must match account role
    if (profile.role !== role) {
      // Ensure no stale auth/session state remains
      await signOut(auth);
      localStorage.removeItem('currentUser');

      const roleMapping = {
        'student': 'Clinical Student',
        'instructor': 'Clinical Instructor',
        'admin': 'Administrator'
      };
      const actualRole = roleMapping[profile.role] || profile.role;
      const selectedRole = roleMapping[role] || role;
      showErrorMessage(`Selected role does not match your account type.`);
      await signOut(auth);
      localStorage.removeItem('currentUser');
      loginInProgress = false;
      return;
    }

    const userData = {
      id: profile.uid,
      name: profile.name || profile.email,
      email: profile.email,
      role: profile.role,
      studentId: profile.studentId || null,
      status: profile.status || null
    };
    localStorage.setItem('currentUser', JSON.stringify(userData));
    localStorage.setItem('loginTime', new Date().toISOString());
    if (profile.role === 'admin') {
      localStorage.setItem('adminCredentials', JSON.stringify({ email, password }));
    } else {
      localStorage.removeItem('adminCredentials');
    }
    showSuccessMessage('Login successful! Redirecting...', 'loginForm');
    setTimeout(() => redirectToRolePage(profile.role), 500);
    loginInProgress = false;
  } catch (error) {
    console.error(error);
    if (error.code === 'auth/user-not-found' && email === 'admin@nursing.edu') {
      try {
        const newAdmin = await createUserWithEmailAndPassword(auth, email, password);
        await createUserProfile(newAdmin.user.uid, email, 'admin', 'System Administrator');
        showSuccessMessage('Admin account created. Please login again.', 'loginForm');
      } catch (createError) {
        console.error('Admin auto-create failed:', createError);
        showErrorMessage('Login failed. Please contact support.', 'loginForm');
      }
      loginInProgress = false;
      return;
    }
    if (error.code === 'auth/user-not-found') showErrorMessage('Email not found. Please contact your administrator.', 'loginForm');
    else if (error.code === 'auth/wrong-password') showErrorMessage('Incorrect password.', 'loginForm');
    else showErrorMessage('Login failed. Please try again.', 'loginForm');
    loginInProgress = false;
  }
}

function switchTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => btn.classList.remove('active'));
  if (tab === 'login') {
    loginForm.classList.add('active');
    signupForm.classList.remove('active');
    tabBtns[0].classList.add('active');
  } else {
    loginForm.classList.remove('active');
    signupForm.classList.add('active');
    tabBtns[1].classList.add('active');
  }
}

function showForgotPassword(event) {
  event.preventDefault();
  document.getElementById('forgotPasswordModal').classList.add('show');
}

function closeForgotPassword() {
  document.getElementById('forgotPasswordModal').classList.remove('show');
}

async function handlePasswordReset(event) {
  event.preventDefault();
  const email = document.getElementById('resetEmail').value.trim();
  if (!email) {
    alert('Please enter an email.');
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    alert('Password reset email sent.');
    closeForgotPassword();
    document.querySelector('#forgotPasswordModal form').reset();
  } catch (error) {
    console.error(error);
    alert('Failed to send reset email.');
  }
}

function checkAlreadyLoggedIn() {
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) return;
    if (loginInProgress) return;

    const profile = await getUserProfile(firebaseUser.uid);
    if (!profile) {
      await signOut(auth);
      localStorage.removeItem('currentUser');
      return;
    }

    // If we have an existing local session that is inconsistent with selected login role,
    // we should not auto-redirect; instead force full login flow.
    const savedUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (savedUser && savedUser.role !== profile.role) {
      await signOut(auth);
      localStorage.removeItem('currentUser');
      return;
    }

    const userData = {
      id: profile.uid,
      name: profile.name || profile.email,
      email: profile.email,
      role: profile.role,
      studentId: profile.studentId || null,
      status: profile.status || null
    };
    localStorage.setItem('currentUser', JSON.stringify(userData));
    redirectToRolePage(profile.role);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await ensureDefaultAdmin();
  checkAlreadyLoggedIn();
});

window.handleLogin = handleLogin;
window.switchTab = switchTab;
window.showForgotPassword = showForgotPassword;
window.closeForgotPassword = closeForgotPassword;
window.handlePasswordReset = handlePasswordReset;
