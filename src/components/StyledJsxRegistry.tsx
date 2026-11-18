'use client';

/* Next.js App Router drops styled-jsx output unless the styles are collected
   through a registry (the pages' <style jsx> tags are transformed but never
   injected). This provider is the documented fix — see styled-jsx README,
   "Next.js App Router" section. */
import { StyleRegistry } from 'styled-jsx';

export default function StyledJsxRegistry({ children }: { children: React.ReactNode }) {
  return <StyleRegistry>{children}</StyleRegistry>;
}
