const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const searchRoutes = require('./routes/searchRoutes');
const db = require('./config/db');


dotenv.config(); 
const app = express();
const port = 4000;

// ✅ Middleware
app.use(cors());
app.use(express.json());

// ✅ Routes
app.use('/', searchRoutes);

if (!db) {
  console.error('❌ Gagal terhubung ke database PostgreSQL');
} else {
  console.log('✅ Terhubung ke database PostgreSQL');
}

// ✅ Rute root
app.get('/', (req, res) => {
  res.send('📚 Selamat datang di API Jurnal');
});

// ✅ Start server
app.listen(port, () => {
  console.log(`🚀 API berjalan di http://localhost:${port}`);
});
