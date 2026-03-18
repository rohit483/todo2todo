import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, deleteUser } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDHbj3fT0U30PCKL8qI4PEftTdp5GjY3XA",
    authDomain: "todo-e8628.firebaseapp.com",
    projectId: "todo-e8628",
    storageBucket: "todo-e8628.firebasestorage.app",
    messagingSenderId: "595031638477",
    appId: "1:595031638477:web:cfdd6531ecb08fe4450484",
    measurementId: "G-0B18QWG1GT"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const API_URL = '';
const taskInput = document.getElementById('task-input');
const addBtn = document.getElementById('add-btn');
const todoList = document.getElementById('todo-list');

// Auth UI Elements
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');
const deleteAccountBtn = document.getElementById('delete-account-btn');

const loginBtn = document.getElementById('login-btn'); // Google
const emailAuthForm = document.getElementById('email-auth-form');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const emailSubmitBtn = document.getElementById('email-submit-btn');
const authError = document.getElementById('auth-error');

// Auth Mode Elements
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authSwitchLink = document.getElementById('auth-switch-link');
const authSwitchText = document.getElementById('auth-switch-text');

let currentUserToken = null;
let isRegisterMode = false;

// --- AUTH UI LOGIC ---
authSwitchLink.addEventListener('click', (e) => {
    e.preventDefault();
    isRegisterMode = !isRegisterMode;
    authError.style.display = 'none';

    if (isRegisterMode) {
        if (authTitle) authTitle.textContent = "Create Account";
        authSubtitle.textContent = "Sign up to start organizing your life.";
        emailSubmitBtn.textContent = "Register";
        authSwitchText.textContent = "Already have an account?";
        authSwitchLink.textContent = "Login";
    } else {
        if (authTitle) authTitle.textContent = "Sign In";
        authSubtitle.textContent = "Welcome back! Please login to your account.";
        emailSubmitBtn.textContent = "Login";
        authSwitchText.textContent = "Don't have an account?";
        authSwitchLink.textContent = "Register here";
    }
});

function showError(message) {
    authError.textContent = message;
    authError.style.display = 'block';
}

function showSuccess(message) {
    authError.textContent = message;
    authError.style.color = '#10b981'; // Success Green
    authError.style.borderColor = '#a7f3d0';
    authError.style.backgroundColor = '#ebfdf5';
    authError.style.display = 'block';
}

function resetErrorStyle() {
    authError.style.color = 'var(--danger)';
    authError.style.borderColor = '#fecaca';
    authError.style.backgroundColor = '#fef2f2';
}

// --- EMAIL / PASSWORD LOGIC ---
emailAuthForm.addEventListener('submit', async () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    authError.style.display = 'none';
    resetErrorStyle();
    emailSubmitBtn.disabled = true;

    try {
        if (isRegisterMode) {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await sendEmailVerification(userCredential.user);
            await signOut(auth); // Force them out immediately until they verify

            // Switch back to Login view visually
            isRegisterMode = false;
            if (authTitle) authTitle.textContent = "Sign In";
            authSubtitle.textContent = "Welcome back! Please login to your account.";
            emailSubmitBtn.textContent = "Login";
            authSwitchText.textContent = "Don't have an account?";
            authSwitchLink.textContent = "Register here";

            showSuccess('Please check your email inbox or spam folder to verify your account before logging in.');
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
    } catch (error) {
        console.error("Auth Exception:", error);
        resetErrorStyle();
        // Translate Firebase errors to user-friendly messages
        if (error.code === 'auth/email-already-in-use') {
            showError('That email is already registered.');
        } else if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            showError('Invalid email or password.');
        } else if (error.code === 'auth/weak-password') {
            showError('Password should be at least 6 characters.');
        } else {
            showError(error.message);
        }
    } finally {
        emailSubmitBtn.disabled = false;
    }
});

// --- GOOGLE LOGIC ---
loginBtn.addEventListener('click', () => {
    authError.style.display = 'none';
    resetErrorStyle();
    signInWithPopup(auth, provider)
        .catch((error) => showError("Google Login failed: " + error.message));
});

logoutBtn.addEventListener('click', () => {
    signOut(auth);
});

// --- DELETE ACCOUNT LOGIC ---
deleteAccountBtn.addEventListener('click', async () => {
    if (!confirm("Are you sure you want to completely delete your account and all your todos? This cannot be undone.")) {
        return;
    }
    
    try {
        const response = await fetch(API_URL + '/user/', {
            method: 'DELETE',
            headers: getHeaders()
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || 'Failed to delete account from server');
        }
        
        // Delete the user locally from Firebase Auth
        const user = auth.currentUser;
        if (user) {
            await deleteUser(user);
        }
        
        // Show success first
        alert("Your account has been successfully deleted.");
        
        // Force a page reload to cleanly boot the user back to the login screen
        window.location.reload();
            
    } catch (error) {
        console.error("Failed to delete account:", error);
        alert("Could not delete account: " + error.message);
    }
});

// --- AUTH STATE LISTENER ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Enforce Email Verification for standard Email/Password accounts
        // (Google accounts are automatically verified by Firebase)
        if (!user.emailVerified) {
            await signOut(auth);
            resetErrorStyle();
            showError("Verification required. Email will be sent to your inbox or spam folder");
            return;
        }

        // User is signed in and verified
        currentUserToken = await user.getIdToken();
        authContainer.style.display = 'none';
        appContainer.style.display = 'block';
        logoutBtn.style.display = 'inline-block';
        deleteAccountBtn.style.display = 'inline-block';
        userInfo.textContent = user.email;
        emailInput.value = '';
        passwordInput.value = '';
        authError.style.display = 'none';
        resetErrorStyle();
        fetchTodos();
    } else {
        // User is signed out
        currentUserToken = null;
        authContainer.style.display = 'block';
        appContainer.style.display = 'none';
        logoutBtn.style.display = 'none';
        deleteAccountBtn.style.display = 'none';
        userInfo.textContent = '';
        todoList.innerHTML = '';
    }
});

// Helper to add the Auth header
function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentUserToken}`
    };
}

// --- READ: Fetch all todos and display them ---
async function fetchTodos() {
    if (!currentUserToken) return;
    try {
        const response = await fetch(API_URL + '/todo2/', {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Network response was not ok');
        const todos = await response.json();

        todoList.innerHTML = '';

        todos.forEach(todo => {
            const li = document.createElement('li');
            if (todo.completed) li.classList.add('completed');

            const taskSpan = document.createElement('span');
            taskSpan.textContent = todo.task;

            const actionsDiv = document.createElement('div');
            actionsDiv.classList.add('actions');

            const updateBtn = document.createElement('button');
            updateBtn.textContent = todo.completed ? 'Undo' : 'Done';
            updateBtn.classList.add('update');
            updateBtn.onclick = () => updateTodo(todo.id);

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.classList.add('delete');
            deleteBtn.onclick = () => deleteTodo(todo.id);

            actionsDiv.appendChild(updateBtn);
            actionsDiv.appendChild(deleteBtn);
            li.appendChild(taskSpan);
            li.appendChild(actionsDiv);
            todoList.appendChild(li);
        });
    } catch (error) {
        console.error('Failed to fetch todos:', error);
        todoList.innerHTML = '<li style="color:red;">Failed to load todos. Are you logged in?</li>';
    }
}

// --- CREATE: Add a new todo ---
async function addTodo() {
    if (!currentUserToken) return;
    const task = taskInput.value;
    if (!task) return;

    try {
        const response = await fetch(API_URL + '/todo2/', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ task: task, completed: false }),
        });
        if (!response.ok) throw new Error('Failed to add task');

        taskInput.value = '';
        fetchTodos();
    } catch (error) {
        console.error('Failed to add todo:', error);
    }
}

// --- UPDATE: Toggle a todo's completed status ---
async function updateTodo(id) {
    try {
        const response = await fetch(`${API_URL}/todo2/${id}`, {
            method: 'PUT',
            headers: getHeaders(),
        });
        if (!response.ok) throw new Error('Failed to update task');
        fetchTodos();
    } catch (error) {
        console.error('Failed to update todo:', error);
    }
}

// --- DELETE: Delete a todo ---
async function deleteTodo(id) {
    try {
        const response = await fetch(`${API_URL}/todo2/${id}`, {
            method: 'DELETE',
            headers: getHeaders(),
        });
        if (!response.ok) throw new Error('Failed to delete task');
        fetchTodos();
    } catch (error) {
        console.error('Failed to delete todo:', error);
    }
}

addBtn.addEventListener('click', addTodo);
taskInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTodo();
});
