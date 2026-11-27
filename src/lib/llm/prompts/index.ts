import type { DocumentType } from '@/lib/documents/types';
import type { ProjectPurpose } from '@/lib/db/enums';

/**
 * Prompt templates (T-303). Each builder returns { system, prompt }.
 * Output contract: strict Markdown; Mermaid fenced blocks where applicable;
 * wireframe = raw HTML with Tailwind CDN.
 */
export interface GenerationInput {
  projectName: string;
  projectDescription: string | null;
  /** Optional (v0.2.3). Null/undefined emits nothing extra — v0.2.2 behaviour. */
  projectPurpose?: ProjectPurpose | null;
  interviewTranscript: { role: 'assistant' | 'user' | 'system'; content: string }[];
  baselineAssumptions: string[];
  injectedAssets: { name: string; content: string }[];
  /** Regeneration only. */
  currentContent?: string;
  userInstruction?: string;
  /** Optional user-selected output language (v0.2.8). */
  outputLanguage?: 'id' | 'en';
}

function outputLanguageBlock(lang?: 'id' | 'en'): string {
  if (lang === 'en') {
    return '\nOUTPUT LANGUAGE: Write the entire document (section headings, prose, tables, Mermaid node labels, and open questions) in clear, natural professional English.\n';
  }
  if (lang === 'id') {
    return '\nOUTPUT LANGUAGE: Write the entire document (section headings, prose, tables, Mermaid node labels, and open questions) in clear, natural professional Indonesian (Bahasa Indonesia), keeping standard technical terms (API, endpoint, JWT, SQL, HTTP status codes, code identifiers) accurate.\n';
  }
  return '';
}

const HUMANIZE_PREAMBLE = `You write like a senior human product person, not like a template.
Rules:
- Concrete over generic. Name real trade-offs; never pad with filler.
- No "In today's fast-paced world". No restating the question.
- Short paragraphs, tight tables, decisions stated with reasons.
- Use compact sections so the entire document fits the output budget. Avoid repeating prior specs.
- Keep Mermaid diagrams small. Use ASCII identifiers, double-quoted flowchart node labels, and one statement per line. For ER diagrams use simple entity names and Mermaid attribute types without SQL constraints or type parameters. Close each diagram fence.
- Output Markdown only. No preamble, no closing summary of what you wrote.`;

function transcriptBlock(
  transcript: GenerationInput['interviewTranscript'],
  hasDescription = false,
): string {
  if (transcript.length === 0) {
    if (hasDescription) {
      return '(no interview transcript: user skipped interview and supplied detailed project description directly. Treat PROJECT and DESCRIPTION as the primary authoritative brief, use BASELINE ASSUMPTIONS only for standard gaps, make pragmatic defaults where specifics are omitted, and list those assumptions and open questions explicitly for user review.)';
    }
    return '(no interview transcript: work from PROJECT, DESCRIPTION if present, and BASELINE ASSUMPTIONS, listing assumptions and open questions explicitly.)';
  }
  const header = '(interview completed or captured below: treat Founder answers as the highest-priority source of truth, refining DESCRIPTION and BASELINE ASSUMPTIONS wherever they add specifics.)';
  const lines = transcript.map((m) => `${m.role === 'user' ? 'Founder' : 'Interviewer'}: ${m.content}`).join('\n');
  return `${header}\n${lines}`;
}

function assetsBlock(assets: GenerationInput['injectedAssets']): string {
  if (assets.length === 0) return '(none)';
  return assets.map((a) => `### ${a.name}\n${a.content}`).join('\n\n');
}

/**
 * What each purpose asks of the writing (v0.2.3). Kept next to the prompt so the
 * emphasis a document gets and the emphasis the interview asks about cannot
 * drift apart.
 */
export const PURPOSE_DIRECTIVE: Record<ProjectPurpose, { label: string; interviewFocus: string; writingEmphasis: string }> = {
  documentation: {
    label: 'Dokumentasi',
    interviewFocus:
      'who will read this document, the problem context, scope and non-goals, and the decisions that need a clear explanation',
    writingEmphasis:
      'Write a self-contained specification that stands on its own. State the rationale behind each decision, make assumptions explicit, and name trade-offs and open questions plainly. The reader may be a lecturer, a PM, or a teammate who was not in the interview.',
  },
  team: {
    label: 'Implementasi tim',
    interviewFocus:
      'technical constraints, the core user and system flows, integrations, failure and error modes, and acceptance criteria',
    writingEmphasis:
      'Prioritize concrete technical contracts: schemas, module boundaries, dependencies between tasks, failure handling, and acceptance criteria that can be tested. Assume the reader is an engineer who will build from this document.',
  },
  ai_agent: {
    label: 'Implementasi dengan AI agent',
    interviewFocus:
      'technical and implementation constraints (as for a team), plus the execution sequence, invariants that must not change, and decisions that still need confirmation before coding',
    writingEmphasis:
      'Maximize unambiguity across documents: use the same entity, endpoint and file names in every document. Give an explicit step-by-step execution order, state locked invariants, and end with an explicit list of open decisions the user must confirm before coding begins.',
  },
};

/** Empty string when no purpose is set, so a legacy project's prompt is unchanged. */
function purposeBlock(purpose: ProjectPurpose | null | undefined): string {
  if (!purpose) return '';
  const directive = PURPOSE_DIRECTIVE[purpose];
  return `\nTARGET PURPOSE: ${directive.label}\n${directive.writingEmphasis}\n`;
}

function contextBlock(input: GenerationInput): string {
  return `PROJECT: ${input.projectName}
${input.projectDescription ? `DESCRIPTION: ${input.projectDescription}` : ''}
${purposeBlock(input.projectPurpose)}
BASELINE ASSUMPTIONS:
${input.baselineAssumptions.length > 0 ? input.baselineAssumptions.map((a) => `- ${a}`).join('\n') : '(none)'}

INTERVIEW TRANSCRIPT:
${transcriptBlock(input.interviewTranscript, Boolean(input.projectDescription?.trim()))}

INJECTED CONTEXT (user assets):
${assetsBlock(input.injectedAssets)}`;
}

const SYSTEM = `${HUMANIZE_PREAMBLE}\nYou are producing one document of a product spec suite. Stay in scope of the document you are asked for.`;

// ── per-document builders ────────────────────────────────────────────────────

function prdPrompt(input: GenerationInput): string {
  return `${contextBlock(input)}

Write the Product Requirements Document. Sections: Problem & audience; Goals and non-goals; Personas; Core user journeys; Feature set (P0/P1/P2); Success metrics; Risks and open questions.`;
}

function architecturePrompt(input: GenerationInput): string {
  return `${contextBlock(input)}

Write the System Architecture document. Sections: Architectural pattern and why; Component diagram (Mermaid flowchart); Data flow for the core loop; Key technical decisions with trade-offs; Scaling path; Failure modes.`;
}

function databasePrompt(input: GenerationInput): string {
  return `${contextBlock(input)}

Write the Database Schema document. Sections: Engine choice and justification; ERD (Mermaid erDiagram); Table definitions with columns, types, constraints; Indexing strategy; Migration approach. Use portable SQL (no SQLite-only features).`;
}

function apiPrompt(input: GenerationInput): string {
  return `${contextBlock(input)}

Write the API Contracts document. Sections: API style and versioning; Authentication; Error envelope with codes; Every endpoint with method, path, request, response, errors; Pagination and rate limiting. Use fenced json code blocks for payloads.`;
}

function tasksPrompt(input: GenerationInput): string {
  return `${contextBlock(input)}

Write the Task Checklist document. Phases 0–8, sequential; each phase lists tasks with a one-line acceptance criterion. Mark dependencies between tasks explicitly. No task longer than one agent turn.`;
}

function memoryPrompt(input: GenerationInput): string {
  return `${contextBlock(input)}

Write the Project Memory document: the context pack a future AI agent (or a new engineer) reads first. Sections: What this product is in two sentences; Decisions made and why (dated); Vocabulary and naming conventions; Things that must not change; Known gaps and next steps. Dense, factual, no prose padding.`;
}

function wireframePrompt(input: GenerationInput): string {
  return `${contextBlock(input)}

Produce wireframe screens as raw HTML. Contract:
- Each screen is wrapped in <screen name="Screen Name"> ... </screen>.
- Inside, a complete self-contained HTML fragment styled with Tailwind utility classes (CDN script tag <script src="https://cdn.tailwindcss.com"></script> at the top of the first screen only).
- 2–5 screens covering the core loop. Desktop-first, clean, Linear-like density.
- No JavaScript beyond the Tailwind CDN. No external images; use colored divs for placeholders.
Output the screens directly, no commentary.`;
}

const REGEN_INSTRUCTION = (input: GenerationInput): string => `
CURRENT DOCUMENT CONTENT:
${input.currentContent ?? '(none — treat as fresh generation)'}

USER INSTRUCTION FOR THIS REVISION:
${input.userInstruction ?? '(none)'}

Rewrite the document applying the instruction. Keep everything else stable. Output the full revised document, not a diff.`;

const BUILDERS: Record<DocumentType, (input: GenerationInput) => string> = {
  prd: prdPrompt,
  architecture: architecturePrompt,
  database: databasePrompt,
  api: apiPrompt,
  tasks: tasksPrompt,
  memory: memoryPrompt,
  wireframe: wireframePrompt,
};

export function buildDocumentPrompt(type: DocumentType, input: GenerationInput): { system: string; prompt: string } {
  const base = BUILDERS[type](input);
  const langSuffix = outputLanguageBlock(input.outputLanguage);
  const withLang = langSuffix ? `${base}\n${langSuffix}` : base;
  const prompt = input.userInstruction !== undefined ? `${withLang}\n${REGEN_INSTRUCTION(input)}` : withLang;
  return { system: SYSTEM, prompt };
}

// ── interview turn ───────────────────────────────────────────────────────────

export function buildInterviewPrompt(input: {
  projectName: string;
  projectDescription?: string | null;
  projectPurpose?: ProjectPurpose | null;
  baselineAssumptions: string[];
  transcript: GenerationInput['interviewTranscript'];
  questionIndex: number;
  maxQuestions: number;
  outputLanguage?: 'id' | 'en';
}): { system: string; prompt: string } {
  const purpose = input.projectPurpose ? PURPOSE_DIRECTIVE[input.projectPurpose] : null;
  const purposeGuidance = purpose
    ? `\nPURPOSE GUIDANCE (${purpose.label}):\nFocus your questions on ${purpose.interviewFocus}.`
    : '';
  const langGuidance =
    input.outputLanguage === 'en'
      ? '\nLANGUAGE: Ask the question and write suggestions in clear, natural English.'
      : input.outputLanguage === 'id'
        ? '\nLANGUAGE: Ask the question and write suggestions in clear, natural Indonesian (Bahasa Indonesia).'
        : '';

  return {
    system: `You run a warm, sharp product interview. One question at a time. Adaptive: aim for ${input.maxQuestions} questions total (never more), wrap up early when you have enough.
You speak like a thoughtful human collaborator, without corporate filler or restating answers verbatim.${purposeGuidance}${langGuidance}
Every reply is STRICT JSON, no markdown fence:
{"question": "...", "suggestions": ["...", "..."], "isComplete": false, "reasoning": "one line, why you ask this"}
"suggestions" holds 2-3 short candidate answers the user might tap. Set "isComplete": true only when the picture is genuinely enough to spec the product.`,
    prompt: `PROJECT: ${input.projectName}
${input.projectDescription?.trim() ? `DESCRIPTION: ${input.projectDescription.trim()}\n` : ''}
BASELINE ASSUMPTIONS:
${input.baselineAssumptions.map((a) => `- ${a}`).join('\n') || '(none)'}

TRANSCRIPT SO FAR:
${transcriptBlock(input.transcript)}

This is question ${input.questionIndex} of at most ${input.maxQuestions}. Reply with the JSON object only.`,
  };
}

export interface InterviewTurn {
  question: string;
  suggestions: string[];
  isComplete: boolean;
  reasoning: string;
}

export function parseInterviewTurn(raw: string): InterviewTurn {
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Model broke the JSON contract — degrade to treating the whole output as the question.
    return { question: raw.trim(), suggestions: [], isComplete: false, reasoning: 'unparseable turn' };
  }
  const obj = (parsed ?? {}) as Record<string, unknown>;
  return {
    question: typeof obj.question === 'string' && obj.question.length > 0 ? obj.question : raw.trim(),
    suggestions: Array.isArray(obj.suggestions) ? obj.suggestions.filter((s): s is string => typeof s === 'string').slice(0, 3) : [],
    isComplete: obj.isComplete === true,
    reasoning: typeof obj.reasoning === 'string' ? obj.reasoning : '',
  };
}
