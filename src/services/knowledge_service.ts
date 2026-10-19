import fs from 'fs';
import path from 'path';
import { KnowledgeSnippet } from '../types/ai';
import { normalizeDistrict } from './district_normalizer';

export interface RawKnowledgeDoc {
  id: string;
  filePath: string;
  category: 'district' | 'flood_safety' | 'basins' | 'project' | 'general';
  title: string;
  content: string;
  terms: Set<string>;
}

class KnowledgeService {
  private docs: Map<string, RawKnowledgeDoc> = new Map();
  private initialized: boolean = false;

  constructor() {
    this.init();
  }

  public init() {
    if (this.initialized) return;
    this.docs.clear();
    const baseDir = path.join(process.cwd(), 'knowledge_base');
    if (!fs.existsSync(baseDir)) {
      this.initialized = true;
      return;
    }

    this.scanDirectory(baseDir);
    this.initialized = true;
  }

  private scanDirectory(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this.scanDirectory(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          this.loadDocFile(fullPath);
        }
      }
    } catch (err) {
      console.warn(`[KnowledgeService] Error scanning directory ${dir}:`, err);
    }
  }

  private loadDocFile(filePath: string) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const filename = path.basename(filePath, '.md');
      const relPath = path.relative(path.join(process.cwd(), 'knowledge_base'), filePath);
      
      let category: RawKnowledgeDoc['category'] = 'general';
      if (relPath.includes('flood_safety')) category = 'flood_safety';
      else if (relPath.includes('basins')) category = 'basins';
      else if (relPath.includes('project')) category = 'project';
      else if (relPath.includes('districts') || ['hyderabad', 'warangal', 'nirmal', 'mancherial', 'bhadradri_kothagudem'].includes(filename)) {
        category = 'district';
      }

      // Extract title from first # heading or filename
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : filename.replace(/_/g, ' ').toUpperCase();

      // Tokenize terms for keyword matching
      const words = content.toLowerCase().match(/[a-z0-9]+/g) || [];
      const terms = new Set(words);

      const docId = filename.toLowerCase();
      this.docs.set(docId, {
        id: docId,
        filePath,
        category,
        title,
        content,
        terms,
      });
    } catch (err) {
      console.warn(`[KnowledgeService] Error reading file ${filePath}:`, err);
    }
  }

  /**
   * Search knowledge base with query keywords and optional district context.
   */
  public searchKnowledge(query: string, districtId?: string, limit: number = 3): KnowledgeSnippet[] {
    this.init();
    if (!query && !districtId) return [];

    const queryTerms = (query || '').toLowerCase().match(/[a-z0-9]+/g) || [];
    const results: KnowledgeSnippet[] = [];

    for (const doc of this.docs.values()) {
      let score = 0;

      // 1. Direct district match
      if (districtId) {
        const norm = normalizeDistrict(districtId);
        const canonId = norm.resolved ? norm.districtId.toLowerCase() : districtId.toLowerCase();
        if (doc.id.includes(canonId) || (norm.canonicalName && doc.title.toLowerCase().includes(norm.canonicalName.toLowerCase()))) {
          score += 10.0;
        }
      }

      // 2. Query word occurrences
      for (const term of queryTerms) {
        if (term.length < 3) continue;
        if (doc.title.toLowerCase().includes(term)) {
          score += 3.0;
        } else if (doc.terms.has(term)) {
          score += 1.0;
        }
      }

      // 3. Category relevance boosting
      const qLower = (query || '').toLowerCase();
      if (doc.category === 'flood_safety' && (qLower.includes('safe') || qLower.includes('precaution') || qLower.includes('protect') || qLower.includes('what to do') || qLower.includes('emergency') || qLower.includes('avoid'))) {
        score += 5.0;
      }
      if (doc.category === 'basins' && (qLower.includes('basin') || qLower.includes('river') || qLower.includes('godavari') || qLower.includes('krishna') || qLower.includes('musi') || qLower.includes('manair') || qLower.includes('upstream') || qLower.includes('downstream'))) {
        score += 5.0;
      }
      if (doc.category === 'project' && (qLower.includes('model') || qLower.includes('formula') || qLower.includes('prototype') || qLower.includes('weight') || qLower.includes('method') || qLower.includes('limitation') || qLower.includes('horizon'))) {
        score += 5.0;
      }

      if (score > 0) {
        results.push({
          documentId: doc.id,
          title: doc.title,
          category: doc.category,
          content: doc.content,
          relevanceScore: Math.round(score * 10) / 10,
        });
      }
    }

    // If no specific detailed markdown file is found, generate structured PROTOTYPE BASELINE knowledge
    if (results.length === 0 && districtId) {
      const norm = normalizeDistrict(districtId);
      if (norm.resolved && norm.canonicalName) {
        results.push({
          documentId: `baseline_${norm.districtId}`,
          title: `${norm.canonicalName} [PROTOTYPE BASELINE]`,
          category: 'district',
          content: `PROTOTYPE BASELINE: Detailed historical archive profile for ${norm.canonicalName} (Telangana Monitored Zone) is currently under compilation. Baseline analysis relies on real-time Open-Meteo telemetry, active hydrological gauge telemetry, citizen report triage, and the deterministic 5-factor mathematical risk model. No unverified historical flood narratives should be inferred.`,
          relevanceScore: 7.0,
        });
      }
    }

    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return results.slice(0, limit);
  }

  /**
   * Retrieves specific district knowledge file or returns limitation statement.
   */
  public getDistrictKnowledge(districtIdOrName: string): string {
    this.init();
    if (!districtIdOrName) return 'PROTOTYPE BASELINE: Verified district knowledge is currently baseline for this district.';

    const norm = normalizeDistrict(districtIdOrName);
    const targetKey = (norm.resolved ? norm.districtId : districtIdOrName).toLowerCase().replace(/[^a-z0-9]/g, '_');

    for (const [id, doc] of this.docs.entries()) {
      if (doc.category === 'district' && (id === targetKey || id.includes(targetKey) || (norm.canonicalName && doc.title.toLowerCase().includes(norm.canonicalName.toLowerCase())))) {
        return doc.content;
      }
    }

    const dName = norm.canonicalName || districtIdOrName;
    return `PROTOTYPE BASELINE: Detailed historical archive document is currently in baseline state for ${dName}. Risk assessment and advisories for this district are driven directly by deterministic 5-factor scoring, live telemetry, and active hydrological signals without speculative historical interpolation.`;
  }

  public getFloodSafetyKnowledge(): string {
    this.init();
    const doc = this.docs.get('flood_safety');
    return doc ? doc.content : 'Follow official directives from Telangana State Disaster Management Authority (TGSDMA). Avoid crossing inundated roads, low causeways, and flooded underpasses.';
  }

  public getBasinKnowledge(): string {
    this.init();
    const doc = this.docs.get('basins');
    return doc ? doc.content : 'Telangana is drained primarily by the Godavari and Krishna river basins with downstream propagation from upper catchments.';
  }

  public getProjectKnowledge(): string {
    this.init();
    const doc = this.docs.get('project');
    return doc ? doc.content : 'NeerDrishti is a 33-district flood intelligence and predictive decision-support system prototype using a 5-factor deterministic risk model and multi-horizon forecasts.';
  }

  public getAllKnowledgeDocsSummary() {
    this.init();
    return Array.from(this.docs.values()).map(doc => ({
      id: doc.id,
      title: doc.title,
      category: doc.category,
      wordCount: doc.content.split(/\s+/).length,
    }));
  }
}

export const knowledgeService = new KnowledgeService();
