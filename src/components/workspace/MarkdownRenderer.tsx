'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Code2, Copy, Eye, AlertTriangle } from 'lucide-react';
import { useTheme } from '@/components/ui';
import { cn } from '@/lib/cn';

let mermaidCounter = 0;

function MermaidBlock({ code }: { code: string }) {
  const { theme } = useTheme();
  const [svg, setSvg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showSource, setShowSource] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const idRef = React.useRef(`mmd-${++mermaidCounter}`);

  React.useEffect(() => {
    let alive = true;
    setError(null);
    (async () => {
      try {
        const mod = await import('mermaid');
        const mermaid = mod.default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: theme === 'dark' ? 'dark' : 'base',
          themeVariables:
            theme === 'dark'
              ? {
                  background: '#222c3d',
                  primaryColor: '#2a364a',
                  primaryTextColor: '#eef2f8',
                  primaryBorderColor: '#6c7f9c',
                  lineColor: '#99aac2',
                  secondaryColor: '#1c2433',
                  tertiaryColor: '#2a364a',
                  fontFamily: 'Schibsted Grotesk, system-ui, sans-serif',
                }
              : {
                  background: '#ffffff',
                  primaryColor: '#f3f1ec',
                  primaryTextColor: '#1c1917',
                  primaryBorderColor: '#d2ccc0',
                  lineColor: '#57534e',
                  secondaryColor: '#faf9f6',
                  tertiaryColor: '#efece4',
                  fontFamily: 'Schibsted Grotesk, system-ui, sans-serif',
                },
        });
        if (!alive) return;
        await mermaid.parse(code.trim());
        if (!alive) return;
        const renderId = `${idRef.current}-${Date.now()}`;
        const { svg: rendered } = await mermaid.render(renderId, code.trim());
        if (alive) setSvg(rendered);
      } catch (e) {
        if (alive) {
          setSvg(null);
          setError(e instanceof Error ? e.message : 'Sintaks diagram Mermaid tidak valid.');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [code, theme]);

  async function copySource() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="my-5 overflow-hidden rounded-xl border border-line bg-canvas">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-sidebar px-3.5 py-2">
        <span className="font-mono text-xs text-ink-2">Diagram Mermaid</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            className="inline-flex min-h-7 items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-ink-2 hover:text-ink"
          >
            {showSource ? (
              <>
                <Eye className="h-3 w-3" aria-hidden="true" />
                <span>Diagram</span>
              </>
            ) : (
              <>
                <Code2 className="h-3 w-3" aria-hidden="true" />
                <span>Kode</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => void copySource()}
            aria-label="Salin kode Mermaid"
            className="inline-flex min-h-7 items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-ink-2 hover:text-ink"
          >
            {copied ? (
              <Check className="h-3 w-3 text-ready-ink" aria-hidden="true" />
            ) : (
              <Copy className="h-3 w-3" aria-hidden="true" />
            )}
            <span>{copied ? 'Disalin' : 'Salin'}</span>
          </button>
        </div>
      </div>

      {showSource ? (
        <pre className="!my-0 !rounded-none !border-0 overflow-x-auto p-4 font-mono text-xs text-ink">
          <code>{code}</code>
        </pre>
      ) : error ? (
        <div className="space-y-3 p-4">
          <div className="flex items-start gap-2 rounded-lg border border-warn/35 bg-warn-soft px-3 py-2 text-xs text-warn">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Diagram tidak dapat dirender otomatis. Menampilkan kode sumber Mermaid.</span>
          </div>
          <pre className="!my-0 overflow-x-auto rounded-lg border border-line bg-sidebar p-3 font-mono text-xs text-ink">
            <code>{code}</code>
          </pre>
        </div>
      ) : svg ? (
        <div
          className="overflow-x-auto bg-surface p-4 flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="p-6 text-center font-mono text-xs text-ink-3">Merender diagram...</div>
      )}
    </div>
  );
}

function CopyablePre({
  children,
  rawText,
}: {
  children: React.ReactNode;
  rawText: string;
}) {
  const [copied, setCopied] = React.useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(rawText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="group relative my-4">
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label="Salin blok kode"
        className="absolute right-2.5 top-2.5 inline-flex h-7 items-center gap-1 rounded-md border border-line bg-surface/90 px-2 text-[11px] font-medium text-ink-2 opacity-80 transition-opacity hover:opacity-100 hover:text-ink"
      >
        {copied ? (
          <Check className="h-3 w-3 text-ready-ink" aria-hidden="true" />
        ) : (
          <Copy className="h-3 w-3" aria-hidden="true" />
        )}
        <span>{copied ? 'Disalin' : 'Salin'}</span>
      </button>
      <pre className="!my-0">{children}</pre>
    </div>
  );
}

export function MarkdownRenderer({
  content,
  className,
  streaming = false,
}: {
  content: string;
  className?: string;
  streaming?: boolean;
}) {
  return (
    <div className={cn('prose-fresh', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            const child = React.Children.toArray(children)[0];
            if (React.isValidElement<{ className?: string; children?: React.ReactNode }>(child)) {
              const cls = child.props.className ?? '';
              const raw = String(child.props.children ?? '').replace(/\n$/, '');
              if (cls.includes('language-mermaid')) {
                if (streaming) {
                  return (
                    <div className="my-4 overflow-hidden rounded-xl border border-line bg-canvas">
                      <div className="border-b border-line bg-sidebar px-3.5 py-2 font-mono text-xs text-ink-3">
                        Diagram Mermaid (dirender setelah dokumen selesai)
                      </div>
                      <pre className="!my-0 !rounded-none !border-0 overflow-x-auto p-4 font-mono text-xs text-ink-2">
                        <code>{raw}</code>
                      </pre>
                    </div>
                  );
                }
                return <MermaidBlock code={raw} />;
              }
              return <CopyablePre rawText={raw}>{children}</CopyablePre>;
            }
            return <pre>{children}</pre>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
