importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyChaWymkd5XlX5pvTWSigwUof11SXM5DWs",
  authDomain: "lift-app-13917.firebaseapp.com",
  projectId: "lift-app-13917",
  storageBucket: "lift-app-13917.firebasestorage.app",
  messagingSenderId: "1051687728666",
  appId: "1:1051687728666:web:2d456ef05ff19b9d0f03a3"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: '/favicon.ico'
  });
});
