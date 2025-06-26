const esClient = require('../config/elasticsearch');
const pool = require('../config/db'); 
const BM25 = require('../utils/bm25');
const cache = require('../utils/cache');

const getPapers = async (req, res) => {
  const { page = 1, limit = 5 } = req.query;
  const offset = (page - 1) * limit;
  
  // Generate cache key
  const cacheKey = cache.generateKey(cache.prefixes.PAPER, 'list', page, limit);

  try {
    const result = await cache.cacheWrapper(cacheKey, async () => {
      const esResult = await esClient.search({
        index: '6fathur',
        body: {
          from: offset,
          size: limit,
          query: { match_all: {} },
          sort: [{ journal_id: { order: 'asc' } }]
        }
      });

      const journals = esResult.hits.hits.map(hit => ({
        id: hit._id,
        ...hit._source
      }));

      return { total: esResult.hits.total.value, results: journals };
    }, 1800); // Cache for 30 minutes

    res.json(result);
  } catch (err) {
    console.error('Elasticsearch error:', err);
    res.status(500).json({ error: 'Gagal mengambil data jurnal' });
  }
};

const getDetailPaper = async (req, res) => {
  const { id } = req.params;
  
  // Generate cache key
  const cacheKey = cache.generateKey(cache.prefixes.PAPER, 'detail', id);

  try {
    const result = await cache.cacheWrapper(cacheKey, async () => {
      const esResult = await esClient.get({
        index: '6fathur',
        id
      });

      if (!esResult.found) {
        throw new Error('Paper not found');
      }

      return esResult._source;
    }, 3600); // Cache for 1 hour

    res.json(result);
  } catch (error) {
    if (error.message === 'Paper not found') {
      return res.status(404).json({ error: 'Jurnal tidak ditemukan' });
    }
    console.error('Elasticsearch error:', error);
    res.status(500).json({ error: 'Gagal mengambil detail jurnal' });
  }
};

const getDokumen = async (req, res) => {
  const cacheKey = cache.generateKey(cache.prefixes.STATS, 'total_journals');

  try {
    const result = await cache.cacheWrapper(cacheKey, async () => {
      const esResult = await esClient.count({ index: '6fathur' });
      return { totalJournals: esResult.count };
    }, 7200); // Cache for 2 hours

    res.json(result);
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

  // Generate cache key based on query
  const cacheKey = cache.generateKey(cache.prefixes.SEARCH, 'papers', 
    Buffer.from(query).toString('base64'));

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
    const result = await cache.cacheWrapper(cacheKey, async () => {
      const esResult = await esClient.search({
        index: '6fathur',
        body: {
          query: esQuery,
          highlight: highlight
        }
      });

      const maxScore = esResult.hits.max_score || 1;

      const hits = esResult.hits.hits.map(hit => ({
        id: hit._id,
        score: +(hit._score / maxScore).toFixed(3),
        ...hit._source,
        highlight: hit.highlight || {}
      }));

      return { total: esResult.hits.total.value, results: hits };
    }, 1800); // Cache for 30 minutes

    res.json(result);
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

  // Generate cache key
  const cacheKey = cache.generateKey(cache.prefixes.SEARCH, 'articles', 
    Buffer.from(query).toString('base64'));

  try {
    const result = await cache.cacheWrapper(cacheKey, async () => {
      // Get all articles from DB (this could also be cached separately)
      const dbResult = await pool.query(`
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
      const allArticles = dbResult.rows;

      if (allArticles.length === 0) {
        return { total: 0, results: [] };
      }

      // Initialize BM25
      const bm25 = new BM25(1.2, 0.75);

      // Add all documents to BM25 corpus
      allArticles.forEach((article, index) => {
        bm25.addDocument(article, index);
      });

      // Perform search
      const bm25Results = bm25.search(query, 50);

      // Normalize scores
      let normalizedResults = [];
      if (bm25Results.length > 0) {
        const scores = bm25Results.map(r => r.score);
        const maxScore = Math.max(...scores);
        const minScore = Math.min(...scores);
        const scoreRange = maxScore - minScore;

        normalizedResults = bm25Results.map(result => ({
          ...result.document,
          score: scoreRange === 0 ? 1.0 : Number(((result.score - minScore) / scoreRange).toFixed(3))
        }));
      }

      return {
        total: normalizedResults.length,
        results: normalizedResults
      };
    }, 1800); // Cache for 30 minutes

    res.json(result);
  } catch (error) {
    console.error('Error in searchArticles:', error);
    res.status(500).json({ 
      error: 'Gagal mencari artikel dengan BM25',
      details: error.message 
    });
  }
};

const GetAllArtikel = async (req, res) => {
  const cacheKey = cache.generateKey(cache.prefixes.ARTICLE, 'latest', '15');

  try {
    const result = await cache.cacheWrapper(cacheKey, async () => {
      const dbResult = await pool.query(`
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
      return dbResult.rows;
    }, 3600); // Cache for 1 hour

    res.json(result);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Gagal mengambil data artikel' });
  }
};

const autoComplete = async (req, res) => {
  try {
    const query = req.query.q?.trim();
    
    if (!query || query.length < 2) {
      return res.json([]);
    }
    
    // Generate cache key
    const cacheKey = cache.generateKey(cache.prefixes.AUTOCOMPLETE, 
      Buffer.from(query.toLowerCase()).toString('base64'));
    
    const result = await cache.cacheWrapper(cacheKey, async () => {
      const sanitizedQuery = query.replace(/[%_]/g, '\\$&');
      
      const dbResult = await pool.query(`
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
      
      return dbResult.rows;
    }, 1800); // Cache for 30 minutes
    
    res.json(result);
    
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Gagal mengambil data artikel' });
  }
};

// Cache management endpoints
const clearCache = async (req, res) => {
  try {
    const { pattern } = req.query;
    
    if (pattern) {
      const deletedCount = await cache.delPattern(pattern);
      res.json({ 
        message: `Cache cleared for pattern: ${pattern}`,
        deletedKeys: deletedCount 
      });
    } else {
      // Clear all cache
      const deletedCount = await cache.delPattern('*');
      res.json({ 
        message: 'All cache cleared',
        deletedKeys: deletedCount 
      });
    }
  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json({ error: 'Gagal menghapus cache' });
  }
};

const getCacheStats = async (req, res) => {
  try {
    const stats = await cache.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Cache stats error:', error);
    res.status(500).json({ error: 'Gagal mengambil statistik cache' });
  }
};

module.exports = { 
  searchPapers, 
  getDokumen, 
  getDetailPaper, 
  getPapers, 
  searchArticles, 
  GetAllArtikel, 
  autoComplete,
  clearCache,
  getCacheStats
};
