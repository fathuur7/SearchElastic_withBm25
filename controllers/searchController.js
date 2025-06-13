// === controllers/searchController.js ===
const esClient = require('../config/elasticsearch');

// get all papers with pagination witout search
const getPapers = async (req, res) => {
  const { page = 1, limit = 4 } = req.query;
  const offset = (page - 1) * limit;  

  try {
    const result = await esClient.search({
      index: 'search-wpys',
      body: {
        from: offset,
        size: limit,
        query: {
          match_all: {}
        },
        sort: [
          { update_date: { order: 'desc' } }
        ]
      }
    });

    const hits = result.hits.hits.map((hit) => ({
      id: hit._id,
      title: hit._source.title,
      abstract: hit._source.abstract,
      authors: hit._source.authors,
      journal: hit._source.journal_ref,
      doi: hit._source.doi,
      pdf: hit._source.pdf_url,
      update_date: hit._source.update_date
    }));

    res.json({ total: result.hits.total.value, results: hits });
  } catch (error) {
    console.error('Elasticsearch error:', error);
    res.status(500).json({ error: 'Gagal mengambil data' });
  }
  return getPapers;
};

const getDetailPaper = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await esClient.get({
      index: 'search-wpys',
      id
    });

    if (!result.found) {
      return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
    }

    res.json(result._source);
  } catch (error) {
    console.error('Elasticsearch error:', error);
    res.status(500).json({ error: 'Gagal mengambil detail dokumen' });
  }
};


const getDokumen = async (req,res) => {
  // buatkan untuk mengambil berapa banyak dokumen yang ada di elasticsearch
  try {
    const result = await esClient.count({ index: 'search-wpys' });
    res.json({ totalDocuments: result.count });
  } catch (error) {
    console.error('Elasticsearch error:', error);
    res.status(500).json({ error: 'Gagal mengambil jumlah dokumen' });
  }
}

const searchPapers = async (req, res) => {
  const query = req.query.q;

  if (!query) {
    return res.status(400).json({ error: 'Parameter q (query) wajib diisi' });
  }

  try {
    const result = await esClient.search({
      index: 'search-wpys',
      body: {
        query: {
          multi_match: {
            query,
            fields: ['title^3', 'abstract', 'authors'],
            fuzziness: 'AUTO'
          }
        },
        highlight: {
          fields: {
            title: {},
            abstract: {}
          }
        }
      }
    });

    const maxScore = result.hits.max_score || 1;

    const hits = result.hits.hits.map((hit) => ({
      id: hit._id,
      score: +(hit._score / maxScore).toFixed(3),
      title: hit._source.title,
      abstract: hit._source.abstract,
      authors: hit._source.authors,
      highlight: hit.highlight || {},
      journal: hit._source.journal_ref,
      doi: hit._source.doi,
      pdf: hit._source.pdf_url,
      update_date: hit._source.update_date
    }));

    res.json({ total: result.hits.total.value, results: hits });
  } catch (error) {
    console.error('Elasticsearch error:', error);
    res.status(500).json({ error: 'Gagal mencari data' });
  }
};

module.exports = { searchPapers , getDokumen , getDetailPaper , getPapers };