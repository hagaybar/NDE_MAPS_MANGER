import { stampShelfUids } from '../../shared/stamp-shelf-uids.mjs';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

describe('stampShelfUids', () => {
  test('adds a data-shelf-uid to a shelf that lacks one', () => {
    const svg = '<svg><rect id="CC_1-4" data-map-object="shelf" x="1" y="2"/></svg>';
    const out = stampShelfUids(svg);
    const m = out.match(/data-shelf-uid="([^"]+)"/);
    expect(m).not.toBeNull();
    expect(m[1]).toMatch(UUID_RE);
    // The rest of the tag's bytes are preserved.
    expect(out).toContain('id="CC_1-4"');
    expect(out).toContain('data-map-object="shelf"');
    expect(out).toContain('x="1"');
    expect(out).toContain('y="2"');
  });

  test('preserves an existing data-shelf-uid unchanged (never overwrites)', () => {
    const svg = '<svg><rect id="CC_1-4" data-map-object="shelf" data-shelf-uid="keep-me-123"/></svg>';
    const out = stampShelfUids(svg);
    expect(out).toContain('data-shelf-uid="keep-me-123"');
    // No second uid was injected.
    expect((out.match(/data-shelf-uid=/g) || []).length).toBe(1);
  });

  test('stamps each shelf that lacks a uid, keeps the one that has it', () => {
    const svg = [
      '<svg>',
      '<rect id="A" data-map-object="shelf"/>',
      '<rect id="B" data-map-object="shelf" data-shelf-uid="b-uid"/>',
      '<rect id="C" data-map-object="shelf"/>',
      '</svg>',
    ].join('');
    const out = stampShelfUids(svg);
    const uids = [...out.matchAll(/data-shelf-uid="([^"]+)"/g)].map(m => m[1]);
    expect(uids.length).toBe(3);
    expect(uids).toContain('b-uid');
    // The two newly-stamped uids are real UUIDs and distinct from each other.
    const stamped = uids.filter(u => u !== 'b-uid');
    expect(stamped.length).toBe(2);
    expect(stamped[0]).toMatch(UUID_RE);
    expect(stamped[1]).toMatch(UUID_RE);
    expect(stamped[0]).not.toBe(stamped[1]);
  });

  test('leaves non-shelf elements untouched', () => {
    const svg = '<svg><rect id="not-a-shelf" x="0"/><g data-map-object="other" id="grp"/></svg>';
    const out = stampShelfUids(svg);
    expect(out).toBe(svg);
    expect(out).not.toContain('data-shelf-uid');
  });

  test('leaves a shelf-marked element without an id untouched', () => {
    const svg = '<svg><rect data-map-object="shelf" x="5"/></svg>';
    const out = stampShelfUids(svg);
    expect(out).toBe(svg);
    expect(out).not.toContain('data-shelf-uid');
  });

  test('is idempotent: re-running produces the same bytes', () => {
    const svg = [
      '<svg>',
      '<rect id="A" data-map-object="shelf"/>',
      '<rect id="B" data-map-object="shelf" data-shelf-uid="b-uid"/>',
      '</svg>',
    ].join('');
    const once = stampShelfUids(svg);
    const twice = stampShelfUids(once);
    expect(twice).toBe(once);
  });

  test('preserves all other bytes verbatim around the stamped tag', () => {
    const svg = '<svg>\n  <!-- comment -->\n  <rect id="A" data-map-object="shelf" class="x"/>\n</svg>';
    const out = stampShelfUids(svg);
    // Comment and surrounding whitespace untouched.
    expect(out).toContain('<!-- comment -->');
    expect(out).toContain('\n  <rect');
    expect(out).toContain('class="x"');
    expect(out).toContain('\n</svg>');
  });
});
