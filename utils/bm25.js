// utils/bm25.js
class BM25 {
  constructor(k1 = 1.2, b = 0.75) {
    this.k1 = k1; // Term frequency saturation parameter
    this.b = b;   // Length normalization parameter
    this.documents = [];
    this.documentFreqs = new Map(); // Document frequency per term
    this.averageDocLength = 0;
    this.totalDocuments = 0;
  }

  // Tokenize dan cleaning text
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 1);
  }

  // Tambah dokumen ke corpus
  addDocument(doc, docId) {
    const tokens = this.tokenize(doc.title + ' ' + (doc.institution || '') + ' ' + (doc.content || ''));
    
    const docInfo = {
      id: docId,
      tokens: tokens,
      length: tokens.length,
      termFreqs: new Map(),
      originalDoc: doc
    };

    // Hitung term frequency dalam dokumen ini
    tokens.forEach(token => {
      docInfo.termFreqs.set(token, (docInfo.termFreqs.get(token) || 0) + 1);
    });

    // Update document frequency (berapa dokumen yang mengandung term ini)
    const uniqueTokens = new Set(tokens);
    uniqueTokens.forEach(token => {
      this.documentFreqs.set(token, (this.documentFreqs.get(token) || 0) + 1);
    });

    this.documents.push(docInfo);
    this.totalDocuments++;
  }

  // Hitung average document length
  calculateAverageDocLength() {
    const totalLength = this.documents.reduce((sum, doc) => sum + doc.length, 0);
    this.averageDocLength = totalLength / this.totalDocuments;
  }

  // Hitung BM25 score untuk query terhadap dokumen
  calculateBM25Score(queryTerms, document) {
    let score = 0;

    queryTerms.forEach(term => {
      const tf = document.termFreqs.get(term) || 0; // Term frequency dalam dokumen
      const df = this.documentFreqs.get(term) || 0; // Document frequency
      
      if (tf > 0 && df > 0) {
        // IDF calculation: log((N - df + 0.5) / (df + 0.5))
        const idf = Math.log((this.totalDocuments - df + 0.5) / (df + 0.5));
        
        // BM25 formula
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (document.length / this.averageDocLength));
        
        score += idf * (numerator / denominator);
      }
    });

    return score;
  }

  // Search dengan BM25
  search(query, limit = 10) {
    if (this.averageDocLength === 0) {
      this.calculateAverageDocLength();
    }

    const queryTerms = this.tokenize(query);
    const results = [];

    this.documents.forEach(doc => {
      const score = this.calculateBM25Score(queryTerms, doc);
      if (score > 0) {
        results.push({
          document: doc.originalDoc,
          score: score,
          docId: doc.id
        });
      }
    });

    // Sort by score (descending) dan limit results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // Reset untuk corpus baru
  reset() {
    this.documents = [];
    this.documentFreqs.clear();
    this.averageDocLength = 0;
    this.totalDocuments = 0;
  }

  // Get statistics
  getStats() {
    return {
      totalDocuments: this.totalDocuments,
      averageDocLength: this.averageDocLength,
      vocabularySize: this.documentFreqs.size,
      parameters: {
        k1: this.k1,
        b: this.b
      }
    };
  }
}

module.exports = BM25;