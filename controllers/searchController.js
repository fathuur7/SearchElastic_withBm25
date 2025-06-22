const esClient = require('../config/elasticsearch');
const pool = require('../config/db'); 
const BM25 = require('../utils/bm25');


const getPapers = async (req, res) => {
  const { page = 1, limit = 5 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const result = await esClient.search({
      index: '6fathur',
      body: {
        from: offset,
        size: limit,
        query: { match_all: {} },
        sort: [{ journal_id: { order: 'asc' } }]
      }
    });

    const journals = result.hits.hits.map(hit => ({
      id: hit._id,
      ...hit._source
    }));

    res.json({ total: result.hits.total.value, results: journals });
  } catch (err) {
    console.error('Elasticsearch error:', err);
    res.status(500).json({ error: 'Gagal mengambil data jurnal' });
  }
};

const getDetailPaper = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await esClient.get({
      index: '6fathur',
      id
    });

    if (!result.found) {
      return res.status(404).json({ error: 'Jurnal tidak ditemukan' });
    }

    res.json(result._source);
  } catch (error) {
    console.error('Elasticsearch error:', error);
    res.status(500).json({ error: 'Gagal mengambil detail jurnal' });
  }
};

const getDokumen = async (req, res) => {
  try {
    const result = await esClient.count({ index: '6fathur' });
    res.json({ totalJournals: result.count });
  } catch (error) {
    console.error('Elasticsearch error:', error);
    res.status(500).json({ error: 'Gagal mengambil jumlah jurnal' });
  }
};

const searchPapers = async (req, res) => {
  const query = req.query.q;

  if (!query) {
    return res.status(400).json({ error: 'Parameter q (query) wajib diisi' });
  }

  const esQuery = {
    bool: {
      should: [
        {
          match: {
            name: {
              query: query,
              fuzziness: 'AUTO'
            }
          }
        },
        {
          match: {
            institution: {
              query: query,
              fuzziness: 'AUTO'
            }
          }
        },
        {
          match: {
            subject_area: {
              query: query,
              fuzziness: 'AUTO'
            }
          }
        }
      ]
    }
  };

  const highlight = {
    fields: {
      name: {},
      institution: {},
      subject_area: {}
    }
  };

  try {
    const result = await esClient.search({
      index: '6fathur',
      body: {
        query: esQuery,
        highlight: highlight
      }
    });

    const maxScore = result.hits.max_score || 1;

    const hits = result.hits.hits.map(hit => ({
      id: hit._id,
      score: +(hit._score / maxScore).toFixed(3),
      ...hit._source,
      highlight: hit.highlight || {}
    }));

    res.json({ total: result.hits.total.value, results: hits });
  } catch (error) {
    console.error('Elasticsearch error:', error);
    res.status(500).json({ error: 'Gagal mencari data jurnal' });
  }
};


const searchArticles = async (req, res) => {
  const query = req.query.q?.trim();
  if (!query) {
    return res.status(400).json({ error: 'Parameter q (query) wajib diisi' });
  }

  try {
    // Ambil semua artikel dari DB
    const result = await pool.query(`
      SELECT 
        a.id,
        a.journal_id,
        j.name AS journal_name,
        j.subject_area,
        a.title,
        a.institution,
        a.url,
        a.year
      FROM articles a
      JOIN journals j ON a.journal_id = j.id
    `);
    const allArticles = result.rows;

    console.log('Total articles from DB:', allArticles.length);

    if (allArticles.length === 0) {
      return res.json({ total: 0, results: [] });
    }

    // Inisialisasi BM25 dengan parameter optimal
    const bm25 = new BM25(1.2, 0.75);

    // Tambahkan semua dokumen ke BM25 corpus
    console.log('Building BM25 corpus...');
    allArticles.forEach((article, index) => {
      bm25.addDocument(article, index);
    });

    // Get BM25 statistics
    const stats = bm25.getStats();
    console.log('BM25 Statistics:', stats);

    // Lakukan pencarian
    console.log('Searching with query:', query);
    const bm25Results = bm25.search(query, 50); // Limit 50 hasil

    console.log('BM25 raw results:', bm25Results.length);

    // Normalisasi score ke range 0-1 untuk frontend
    let normalizedResults = [];
    if (bm25Results.length > 0) {
      const scores = bm25Results.map(r => r.score);
      const maxScore = Math.max(...scores);
      const minScore = Math.min(...scores);
      const scoreRange = maxScore - minScore;

      console.log('Score range:', { minScore, maxScore, scoreRange });

      normalizedResults = bm25Results.map(result => ({
        ...result.document,
        score: scoreRange === 0 ? 1.0 : Number(((result.score - minScore) / scoreRange).toFixed(3)),
        // bm25Score: Number(result.score.toFixed(4)), // Simpan original BM25 score untuk debug
        // docId: result.docId
      }));
    }

    console.log('Final results count:', normalizedResults.length);
    console.log('Top 3 results scores:', normalizedResults.slice(0, 3).map(r => ({
      title: r.title?.substring(0, 50) + '...',
      score: r.score,
      bm25Score: r.bm25Score
    })));

    res.json({
      total: normalizedResults.length,
      results: normalizedResults,
      debug: {
        query: query,
        algorithm: 'BM25',
        stats: stats,
        processing: {
          totalArticles: allArticles.length,
          matchedArticles: normalizedResults.length,
          scoreRange: bm25Results.length > 0 ? {
            min: Math.min(...bm25Results.map(r => r.score)),
            max: Math.max(...bm25Results.map(r => r.score))
          } : null
        }
      }
    });

  } catch (error) {
    console.error('Error in searchArticles:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Gagal mencari artikel dengan BM25',
      details: error.message 
    });
  }
};

const GetAllArtikel = async (req, res) => {
  try {
    const result = await pool.query(`
        SELECT 
          a.id,
          a.journal_id,
          j.name AS journal_name,
          j.subject_area,
          a.title,
          a.institution,
          a.url,
          a.year
        FROM articles a
        JOIN journals j ON a.journal_id = j.id
        ORDER BY a.year DESC
        LIMIT 15
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Gagal mengambil data artikel' });
  }
};


const autoComplete = async (req, res) => {
  try {
    const query = req.query.q?.trim();
    
    // Input validation
    if (!query) {
      return res.json([]);
    }
    
    // Minimum query length to reduce unnecessary database calls
    if (query.length < 2) {
      return res.json([]);
    }
    
    // Sanitize query to prevent potential issues
    const sanitizedQuery = query.replace(/[%_]/g, '\\$&');
    
    const result = await pool.query(`
      SELECT 
        a.title
      FROM articles a
      WHERE a.title ILIKE $1
      ORDER BY 
        CASE 
          WHEN a.title ILIKE $2 THEN 1
          WHEN a.title ILIKE $3 THEN 2
          ELSE 3
        END,
        LENGTH(a.title),
        a.title
      LIMIT 5
    `, [
      `%${sanitizedQuery}%`,
      `${sanitizedQuery}%`,
      `% ${sanitizedQuery}%`
    ]);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Gagal mengambil data artikel' });
  }
};

module.exports = { searchPapers, getDokumen, getDetailPaper, getPapers, searchArticles , GetAllArtikel , autoComplete};