
// src/firebase.js
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/database'; // Realtime Databaseをインポート

// Firebaseプロジェクトの設定情報を環境変数から取得
const firebaseConfig = {
    apiKey: "AIzaSyD8Pjh4wYqe7jM7zWqVJTuFHTYezFfC3_0",
    authDomain: "spotify-release-checker-2e513.firebaseapp.com",
    databaseURL: "https://spotify-release-checker-2e513-default-rtdb.firebaseio.com",
    projectId: "spotify-release-checker-2e513",
    storageBucket: "spotify-release-checker-2e513.firebasestorage.app",
    messagingSenderId: "727122672308",
    appId: "1:727122672308:web:2a23edc851e593c7dcb5e1" 
};

// Firebaseを初期化
firebase.initializeApp(firebaseConfig);

export const auth = firebase.auth();
export const database = firebase.database(); // Realtime Databaseの参照をエクスポート

export default firebase;
