import type {
  Content,
  ContentTable,
  CustomTableLayout,
  StyleDictionary,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import type { Company } from '../env';
import { DOCUMENT_FONT } from './fonts';
import { letterheadLogo } from './letterhead-logo';

/**
 * The letterhead system every document in this app is built on.
 *
 * It is deliberately plain: black type on white, ruled tables, no color washes
 * and no shaded header rows. That is how a bill in this trade is expected to
 * look, and it is also what survives a photocopier and a fax, which is what
 * happens to these documents. The only color on the page is the logo.
 *
 * Nothing here calculates. A builder receives figures that are already computed
 * and already formatted by the shared formatters, so a document can never state
 * an amount the screen does not.
 */

const BLACK = '#000000';

/**
 * A4 is 595.28pt wide. Side margins of 36 leave 523pt of usable width, which is
 * what the tables are sized against. Top and bottom are kept tight on purpose:
 * these documents are figures, and the room belongs to the body.
 */
const SIDE_MARGIN = 36;
export const CONTENT_WIDTH = 595.28 - SIDE_MARGIN * 2;

/**
 * The logo sits top left at 150pt wide, which puts the wordmark at roughly 9pt:
 * small enough to leave the header compact, large enough to read.
 */
const LOGO_WIDTH = 150;

/**
 * The rule every table in every document is drawn with: one weight, one color,
 * no exceptions. An even grid is what an accounting document looks like, and
 * mixing weights to imply hierarchy is a design habit that does not belong on a
 * printed ledger.
 *
 * 0.5pt is the thinnest line a laser printer and a photocopier both hold.
 * Anything finer starts dropping out of the copy a party actually files.
 */
const RULE_WIDTH = 0.5;

export const tableLayout: CustomTableLayout = {
  hLineWidth: () => RULE_WIDTH,
  vLineWidth: () => RULE_WIDTH,
  hLineColor: () => BLACK,
  vLineColor: () => BLACK,
  paddingTop: () => 3.5,
  paddingBottom: () => 3.5,
  paddingLeft: () => 4,
  paddingRight: () => 4,
};

/**
 * A ledger's table. Same grid as a bill's, a little tighter vertically because a
 * statement carries many more rows.
 */
export const ledgerLayout: CustomTableLayout = {
  hLineWidth: () => RULE_WIDTH,
  vLineWidth: () => RULE_WIDTH,
  hLineColor: () => BLACK,
  vLineColor: () => BLACK,
  paddingTop: () => 3.2,
  paddingBottom: () => 3.2,
  paddingLeft: () => 4,
  paddingRight: () => 4,
};

/** A rule across the content width, used to close a block off. */
export function rule(marginTop = 4, marginBottom = 6): Content {
  return {
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: CONTENT_WIDTH,
        y2: 0,
        lineWidth: 0.5,
        lineColor: BLACK,
      },
    ],
    margin: [0, marginTop, 0, marginBottom],
  };
}

/** A heading over a block, the way a statement announces its activity table. */
export function sectionLabel(text: string): Content {
  return { text, style: 'section' };
}

/**
 * Label, colon, value, with the colons in a column. Borrowed from how a bank
 * statement sets its account details: it scans far faster than bold labels
 * running into their values.
 */
export function labelledPairs(
  pairs: MetaPair[],
  options: { fontSize?: number } = {},
): ContentTable {
  return {
    table: {
      body: pairs.map((pair) => [
        { text: pair.label },
        { text: ':' },
        { text: pair.value },
      ]),
    },
    layout: 'noBorders',
    fontSize: options.fontSize ?? 8.5,
  };
}

/**
 * Logo left, company details right, then a rule. Two columns rather than a
 * centered stack, because it is about half the height for the same information.
 */
function letterhead(company: Company): Content {
  const logo = letterheadLogo();

  const contact: string[] = [];
  if (company.address) contact.push(company.address);
  if (company.phone) contact.push(`Mobile: ${company.phone}`);
  const online = [
    company.email ? `Email: ${company.email}` : '',
    company.web ? `Web: ${company.web}` : '',
  ].filter(Boolean);
  if (online.length > 0) contact.push(online.join('  |  '));

  return [
    {
      columns: [
        // The logo carries the company name, so it is not set again as type.
        logo
          ? { svg: logo, width: LOGO_WIDTH }
          : { width: LOGO_WIDTH, text: company.name, style: 'company' },
        {
          width: '*',
          stack: contact.map((line) => ({ text: line })),
          style: 'address',
        },
      ],
      columnGap: 16,
    },
    {
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 4,
          x2: CONTENT_WIDTH,
          y2: 4,
          lineWidth: 0.8,
          lineColor: BLACK,
        },
      ],
      margin: [0, 5, 0, 8],
    },
  ];
}

export type MetaPair = { label: string; value: string };

/**
 * Who the document is for, and which document it is: party on the left, the
 * numbers on the right. One row, because a bill is read across, not down.
 */
function partyAndMeta(
  heading: string,
  party: { name: string; address: string | null; phone: string | null },
  meta: MetaPair[],
): Content {
  return {
    columns: [
      {
        width: '*',
        stack: [
          { text: heading, style: 'blockLabel' },
          { text: party.name, bold: true },
          ...(party.address ? [{ text: party.address }] : []),
          ...(party.phone ? [{ text: `Phone: ${party.phone}` }] : []),
        ],
      },
      { width: 'auto', ...labelledPairs(meta) },
    ],
    columnGap: 20,
    margin: [0, 0, 0, 8],
  };
}

/**
 * Room to sign and seal. One column per signatory, spread across the page.
 *
 * The gap above the rules is deliberate and generous: a signature in this trade
 * comes with a rubber seal over it, and a block set tight to the text above
 * leaves nowhere to put one.
 */
function signatureBlock(signatories: string[]): Content {
  const alignment = (index: number) =>
    index === 0
      ? ('left' as const)
      : index === signatories.length - 1
        ? ('right' as const)
        : ('center' as const);

  return {
    columns: signatories.map((name, index) => ({
      text: `\n\n_____________________\n${name}`,
      alignment: alignment(index),
    })),
    fontSize: 8.5,
    margin: [0, 48, 0, 0],
  };
}

/**
 * "In Words: ... Only", the line a signed document is expected to carry. Set
 * across the full width: a figure in crores runs to a long sentence, and it
 * reads better wrapping over two lines than squeezed into half the page.
 */
export function inWordsLine(words: string): Content {
  return {
    text: [{ text: 'In Words: ', bold: true }, words],
    margin: [0, 8, 0, 0],
    fontSize: 8.5,
  };
}

const styles: StyleDictionary = {
  company: { fontSize: 15, bold: true, color: BLACK },
  address: { fontSize: 7.5, color: BLACK, alignment: 'right', lineHeight: 1.25 },
  title: {
    fontSize: 13,
    bold: true,
    color: BLACK,
    alignment: 'center',
    characterSpacing: 1.2,
    margin: [0, 0, 0, 8],
  },
  blockLabel: { fontSize: 7.5, color: BLACK, margin: [0, 0, 0, 1] },
  section: {
    fontSize: 8.5,
    bold: true,
    characterSpacing: 0.7,
    margin: [0, 4, 0, 3],
  },
  tableHead: { bold: true, fontSize: 8 },
  totalRow: { bold: true },
  note: { fontSize: 8 },
};

export type OfficialDocument = {
  company: Company;
  /** "Bill", "Statement of Account". */
  title: string;
  partyHeading: string;
  party: { name: string; address: string | null; phone: string | null };
  /** The document's own numbers, shown against the party block. */
  meta: MetaPair[];
  /** Anything between the party block and the table, such as a section label. */
  beforeBody?: Content[];
  /** The document's own table, built by the caller. */
  body: ContentTable;
  /** Anything between the table and the signatures. */
  afterBody?: Content[];
  signatories: string[];
  /** Anything after the signatures, such as a party confirmation slip. */
  afterSignatures?: Content[];
};

/** Assemble one letterhead document. Every builder in this app ends up here. */
export function buildDocument(doc: OfficialDocument): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    // A4 office standard, with the top and bottom pulled in so the body gets
    // the page. The footer sits inside the bottom margin, which is why it is 30.
    pageMargins: [SIDE_MARGIN, 24, SIDE_MARGIN, 30],
    defaultStyle: { font: DOCUMENT_FONT, fontSize: 9, color: BLACK },
    content: [
      letterhead(doc.company),
      { text: doc.title.toUpperCase(), style: 'title' },
      partyAndMeta(doc.partyHeading, doc.party, doc.meta),
      ...(doc.beforeBody ?? []),
      doc.body,
      ...(doc.afterBody ?? []),
      // A document that is signed carries the block; a statement, which is a
      // record rather than an instrument, passes none and gets none.
      ...(doc.signatories.length > 0
        ? [signatureBlock(doc.signatories)]
        : []),
      ...(doc.afterSignatures ?? []),
    ],
    // A statement can run to several pages, and a page of figures with no
    // number on it is not something to send a party.
    footer: (currentPage, pageCount) => ({
      text: `Page ${currentPage} of ${pageCount}`,
      alignment: 'center',
      fontSize: 7.5,
      margin: [0, 10, 0, 0],
    }),
    styles,
  };
}

/** Flatten every text string in a definition, for assertions in tests. */
export function flattenDocumentText(definition: TDocumentDefinitions): string {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (node == null) return;
    if (typeof node === 'string') {
      parts.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'object') {
      const record = node as Record<string, unknown>;
      if ('text' in record) walk(record.text);
      if ('stack' in record) walk(record.stack);
      if ('columns' in record) walk(record.columns);
      if ('table' in record) {
        const table = record.table as { body?: unknown } | undefined;
        if (table?.body) walk(table.body);
      }
      if ('content' in record) walk(record.content);
    }
  };
  walk(definition.content);
  return parts.join(' ');
}
