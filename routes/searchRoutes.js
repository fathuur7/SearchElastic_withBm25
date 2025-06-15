const express = require('express');
const router = express.Router();
const { searchPapers, getDokumen , getDetailPaper, getPapers , searchArticles } = require('../controllers/searchController');

router.get('/search', searchPapers);
router.get('/dokumen', getDokumen);
router.get('/detail/:id', getDetailPaper);
router.get('/getPapers',  getPapers);
router.get('/searchArticles', searchArticles);
router.get('health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

module.exports = router;
