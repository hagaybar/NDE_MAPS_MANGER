/**
 * @jest-environment jsdom
 */
import { buildMapEditorScaffold } from '../components/map-editor/scaffold.js';

describe('Map Editor scaffold — #23 architecture invariant', () => {
  beforeEach(() => {
    document.body.innerHTML = buildMapEditorScaffold({ emptyMessage: 'none' });
  });

  test('#map-side-panel is a SIBLING of #map-canvas inside #map-editor-split, not a descendant', () => {
    const split = document.getElementById('map-editor-split');
    const canvas = document.getElementById('map-canvas');
    const panel = document.getElementById('map-side-panel');

    expect(split).not.toBeNull();
    expect(canvas).not.toBeNull();
    expect(panel).not.toBeNull();

    // The load-bearing move: the panel must NOT live inside the force-LTR canvas
    // (that nesting is the #23 precondition). It is a grid sibling.
    expect(canvas.contains(panel)).toBe(false);
    expect(split.contains(canvas)).toBe(true);
    expect(split.contains(panel)).toBe(true);
  });

  test('the split sits below the header inside #map-editor-view', () => {
    const view = document.getElementById('map-editor-view');
    const header = view.querySelector('.map-editor__header');
    const split = document.getElementById('map-editor-split');
    expect(view.contains(header)).toBe(true);
    expect(view.contains(split)).toBe(true);
    expect(header.contains(split)).toBe(false); // header stays full-width above the split
  });
});
