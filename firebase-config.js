// firebase-config.js (na EXTENSÃO)

// Use o SDK compatível com Manifest V3, importando de um arquivo local
// (Você precisará baixar o SDK e incluí-lo no seu projeto)
// Por simplicidade, este exemplo usará a API REST, que não precisa do SDK.

const firebaseConfig = {
    apiKey: "AIzaSyB5wO0x-7NFmh6waMKzWzRew4ezfYOmYBI",
    authDomain: "site-ati-75d83.firebaseapp.com",
    databaseURL: "https://site-ati-75d83-default-rtdb.firebaseio.com/",
    projectId: "site-ati-75d83"
    // Outras chaves não são necessárias para esta operação
};

// Função para buscar os templates usando a API REST do Realtime Database
async function fetchTemplatesFromFirebase(username, dataType = 'respostas') {
  if (!username) {
    console.log("Nenhum atendente logado, não há respostas para buscar.");
    return []; 
  }

  const dbURL = firebaseConfig.databaseURL;
  // Constrói a URL para o nó específico do atendente e do tipo de dado
  const url = `${dbURL}${dataType}/${username}.json`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Erro na rede: ${response.statusText}`);
    }
    const data = await response.json();
    
    // O Realtime Database retorna null se o nó não existir
    if (data === null) {
      return [];
    }
    
    // A API REST retorna os dados no formato correto (array de objetos)
    return data;
  } catch (error) {
    console.error(`ATI Extensão: Falha ao buscar dados para '${username}' em '${dataType}'.`, error);
    throw error;
  }
}