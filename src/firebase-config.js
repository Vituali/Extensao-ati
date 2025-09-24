import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// A configuração do seu app Firebase que já está em uso
const firebaseConfig = {
    apiKey: "AIzaSyB5wO0x-7NFmh6waMKzWzRew4ezfYOmYBI",
    authDomain: "site-ati-75d83.firebaseapp.com",
    databaseURL: "https://site-ati-75d83-default-rtdb.firebaseio.com/",
    projectId: "site-ati-75d83",
    storageBucket: "site-ati-75d83.appspot.com",
    messagingSenderId: "467986581951",
    appId: "1:467986581951:web:046a778a0c9b6967d5790a"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Exporta as instâncias para serem usadas em outros módulos
export { app, db, auth };
