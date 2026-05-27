const mysql = require('mysql2');

// Configura a conexão com o banco de dados local
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',      // Usuário padrão do MySQL
    password: '',      // Coloque a senha do seu MySQL aqui (vazio se for XAMPP)
    database: 'saep_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// TESTE DE CONEXÃO: Usando a variável correta (pool) antes de exportar
pool.query('SELECT 1 + 1 AS resultado', (err, rows) => {
    if (err) {
        console.error('❌ ERRO CRÍTICO: Não conectou no banco de dados!');
        console.error('Motivo do erro:', err.message);
        console.error('👉 Verifique se o MySQL Workbench ou XAMPP está ligado e se a senha está certa.');
    } else {
        console.log('✅ SENSACIONAL! O banco de dados está conectado e respondendo!');
    }
});

// Exportação correta usando promises para o seu server.js
module.exports = pool.promise();