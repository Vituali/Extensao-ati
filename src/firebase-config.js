// src/firebase-config.js

// Importa as funções necessárias do Firebase SDK
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get } from "firebase/database";

// ATENÇÃO: Substitua pelas suas credenciais reais do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyB5wO0x-7NFmh6waMKzWzRew4ezfYOmYBI",
    authDomain: "site-ati-75d83.firebaseapp.com",
    databaseURL: "https://site-ati-75d83-default-rtdb.firebaseio.com/",
    projectId: "site-ati-75d83"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

/**
 * Busca templates do Firebase Realtime Database.
 * @param {string} attendant - O nome do atendente.
 * @param {string} node - O "nó" do banco de dados (ex: 'respostas' ou 'modelos_os').
 * @returns {Promise<Array>} - Uma promessa que resolve para uma lista de templates.
 */
async function fetchTemplatesFromFirebase(attendant, node) {
  if (!attendant || !node) {
    console.error("Atendente ou nó não fornecido para busca no Firebase.");
    return [];
  }

  // Cria uma referência para o local dos dados no banco
  const dbRef = ref(database, `atendentes/${attendant}/${node}`);

  try {
    const snapshot = await get(dbRef);
    if (snapshot.exists()) {
      // Converte o objeto retornado pelo Firebase em uma lista (array)
      const data = snapshot.val();
      return Object.values(data);
    } else {
      console.log(`Nenhum dado encontrado em 'atendentes/${attendant}/${node}'`);
      return [];
    }
  } catch (error) {
    console.error("Erro ao buscar dados do Firebase:", error);
    throw error; // Propaga o erro para que o .catch no chatmix.js funcione
  }
}