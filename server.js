const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const db = require('./database');

const app = express();

// Configurações do servidor
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'chave-secreta-saep',
    resave: false,
    saveUninitialized: true
}));

// Proteção para não acessar as páginas sem fazer login
function verificarAutenticacao(req, res, next) {
    if (req.session.usuario) return next();
    res.redirect('/login');
}

// --- TELA DE LOGIN ---
app.get('/login', (req, res) => {
    res.render('login', { erro: null });
});

app.post('/login', async (req, res) => {
    const { login, senha } = req.body;
    try {
        const [rows] = await db.query('SELECT * FROM usuario WHERE login = ? AND senha = ?', [login, senha]);
        if (rows.length > 0) {
            req.session.usuario = rows[0]; // Salva o usuário na sessão
            res.redirect('/');
        } else {
            res.render('login', { erro: 'Usuário ou senha incorretos.' });
        }
    } catch (err) {
        res.render('login', { erro: 'Erro ao conectar no banco de dados.' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// --- TELA PRINCIPAL (HOME) ---
app.get('/', verificarAutenticacao, (req, res) => {
    res.render('index', { usuario: req.session.usuario });
});

// --- TELA DE CADASTRO DE PRODUTOS (CRUD) ---
app.get('/produtos', verificarAutenticacao, async (req, res) => {
    const { busca } = req.query;
    let query = 'SELECT * FROM produto WHERE ativo = true';
    let params = [];

    if (busca) {
        query += ' AND (nome LIKE ? OR codigo_barras LIKE ?)';
        params = [`%${busca}%`, `%${busca}%`];
    }

    const [produtos] = await db.query(query, params);
    res.render('cadastro', { produtos, busca: busca || '', erro: null });
});

app.post('/produtos/criar', verificarAutenticacao, async (req, res) => {
    const { nome, codigo_barras, quantidade, estoque_minimo } = req.body;
    
    if (!nome || quantidade < 0 || estoque_minimo < 0) {
        const [produtos] = await db.query('SELECT * FROM produto WHERE ativo = true');
        return res.render('cadastro', { produtos, busca: '', erro: 'Dados inválidos. Preencha corretamente.' });
    }

    await db.query('INSERT INTO produto (nome, codigo_barras, quantidade, estoque_minimo) VALUES (?, ?, ?, ?)', 
        [nome, codigo_barras, quantidade, estoque_minimo]);
    res.redirect('/produtos');
});

app.post('/produtos/deletar/:id', verificarAutenticacao, async (req, res) => {
    await db.query('UPDATE produto SET ativo = false WHERE id = ?', [req.params.id]);
    res.redirect('/produtos');
});

// --- TELA DE GESTÃO DE ESTOQUE (ORDENAÇÃO BUBBLE SORT E MOVIMENTAÇÃO) ---
function bubbleSort(arr) {
    let n = arr.length;
    for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < n - i - 1; j++) {
            if (arr[j].nome.toLowerCase() > arr[j + 1].nome.toLowerCase()) {
                let temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
    return arr;
}

app.get('/estoque', verificarAutenticacao, async (req, res) => {
    try {
        const [produtos] = await db.query('SELECT * FROM produto WHERE ativo = true');
        const produtosOrdenados = bubbleSort(produtos); // Aplica a ordenação A-Z requerida
        
        // Pega o alerta salvo na sessão (se houver um)
        const alerta = req.session.alerta_estoque || null;
        
        // Limpa a variável da sessão logo após ler, para que o alerta não fique reaparecendo eternamente
        req.session.alerta_estoque = null; 

        res.render('estoque', { produtos: produtosOrdenados, alerta });
    } catch (err) {
        res.status(500).send('Erro ao carregar o estoque.');
    }
});

app.post('/estoque/movimentar', verificarAutenticacao, async (req, res) => {
    const { produto_id, quantidade, operacao } = req.body;
    const qtd = parseInt(quantidade);

    try {
        const [prodRows] = await db.query('SELECT * FROM produto WHERE id = ?', [produto_id]);
        const produto = prodRows[0];

        let novaQuantidade = produto.quantidade;

        if (operacao === 'ENTRADA') {
            novaQuantidade += qtd;
        } else if (operacao === 'SAIDA') {
            novaQuantidade -= qtd;
            if (novaQuantidade < 0) novaQuantidade = 0;

            // REGRA DO ESTOQUE MÍNIMO: Dispara e grava o alerta na sessão se ficar abaixo do configurado
            if (novaQuantidade < produto.estoque_minimo) {
                req.session.alerta_estoque = `⚠️ ALERTA DE SEGURANÇA: O produto "${produto.nome}" atingiu o nível crítico de armazenamento! Saldo atual: ${novaQuantidade} unidades.`;
            }
        }

        // Atualiza a nova quantidade no banco de dados
        await db.query('UPDATE produto SET quantidade = ? WHERE id = ?', [novaQuantidade, produto_id]);
        
        // Grava o histórico na tabela de auditoria para fins de Rastreabilidade (Item 7.1.3)
        await db.query('INSERT INTO movimentacao_estoque (produto_id, usuario_id, quantidade, operacao) VALUES (?, ?, ?, ?)',
            [produto_id, req.session.usuario.id, qtd, operacao]);

        // Redireciona de volta salvando as alterações e disparando o render
        res.redirect('/estoque');
    } catch (err) {
        res.status(500).send('Erro ao processar movimentação.');
    }
});

app.listen(3000, () => console.log('Sistema rodando com sucesso na porta 3000!'));