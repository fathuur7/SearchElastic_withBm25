require('dotenv').config(); // ⬅️ Harus di atas semuanya
const { Client } = require('@elastic/elasticsearch');

const esClient = new Client({
  node: process.env.ELASTICSEARCH_NODE,
  auth: {
    apiKey: process.env.APIKEY
  },
  serverless: true
});

module.exports = esClient;
