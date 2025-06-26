const express = require('express');
const router = express.Router();
const { searchPapers, getDokumen , getDetailPaper, getPapers , searchArticles, GetAllArtikel, getCacheStats, clearCache,autoComplete} = require('../controllers/searchController');

// jurnal
router.get('/search', searchPapers);
router.get('/dokumen', getDokumen);
router.get('/detail/:id', getDetailPaper);
router.get('/getPapers',  getPapers);

// artikel
router.get('/getAllArtikel', GetAllArtikel);
router.get('/searchArticles', searchArticles);

// utils
router.get('/autocomplete', autoComplete);

// GET /api/cache/stats - Get cache statistics
router.get('/stats', getCacheStats);

// DELETE /api/cache/clear - Clear cache
router.delete('/clear', clearCache);

router.get('health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

module.exports = router;
