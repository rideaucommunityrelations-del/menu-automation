require('dotenv').config();

const express = require('express');
const path = require('path');

require('./db/db'); // ensure schema is created on startup

const menuRouter = require('./routes/menu');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/download', express.static(path.join(__dirname, 'output')));

app.use('/', menuRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Menu app listening on http://localhost:${PORT}`);
});

module.exports = app;
