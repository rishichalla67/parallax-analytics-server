const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');

require('dotenv').config();

const middlewares = require('./middlewares');
const api = require('./api');
const coingecko = require('./api/coingecko');
const ophir = require('./api/ophir');
const kosher = require('./api/kosher');

const app = express();

app.use(morgan('dev'));
app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/', coingecko);
app.use('/ophir', ophir);
app.use('/kosher', kosher);
// app.use('/api/v1', api);

app.use(middlewares.notFound);
app.use(middlewares.errorHandler);

module.exports = app;
