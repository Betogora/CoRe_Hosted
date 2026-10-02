export interface HeadingToken { text: string; depth: number; tokens: unknown[] }
export class Marked {
  constructor(options: {
    gfm: boolean;
    renderer: {
      heading(this: { parser: { parseInline(tokens: unknown[]): string } }, token: HeadingToken): string;
      code(token: { text: string; lang?: string }): string | false;
    };
  });
  parse(markdown: string): string;
}
