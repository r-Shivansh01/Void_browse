export interface FuzzyResult<T> {
  item: T;
  score: number;
}

/**
 * Fuzzy search matches a query against a list of items using contiguous substring
 * matching first (highest weight), followed by sequence-character matching.
 */
export function fuzzySearch<T>(
  query: string,
  items: T[],
  keySelector: (item: T) => string[]
): T[] {
  if (!query) return items;
  const q = query.toLowerCase().trim();
  
  const scored = items.map((item) => {
    const targets = keySelector(item).map((t) => t.toLowerCase());
    let maxScore = 0;
    
    for (const target of targets) {
      let score = 0;
      if (target === q) {
        score = 100; // Perfect match
      } else if (target.startsWith(q)) {
        score = 80 + (q.length / target.length) * 15; // Prefix match
      } else if (target.includes(q)) {
        score = 60 + (q.length / target.length) * 10; // Substring match
      } else {
        // Character-sequence match (letters exist in order, but not contiguous)
        let qIdx = 0;
        let tIdx = 0;
        let matches = 0;
        
        while (qIdx < q.length && tIdx < target.length) {
          if (q[qIdx] === target[tIdx]) {
            qIdx++;
            matches++;
          }
          tIdx++;
        }
        
        if (matches === q.length) {
          score = 30 + (q.length / target.length) * 10;
        }
      }
      
      if (score > maxScore) {
        maxScore = score;
      }
    }
    
    return { item, score: maxScore };
  });
  
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.item);
}
