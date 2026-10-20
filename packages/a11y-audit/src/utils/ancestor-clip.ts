/**
 * Whether an element is cut away by its rendered ancestors.
 *
 * Runs in the browser, so it must stay self-contained: Playwright serializes
 * it with `toString()`, and nothing it uses may
 * come from this module's scope.
 */
export interface AncestorClip {
  /**
   * An ancestor whose overflow is not visible hides the element: it does not
   * overlap that ancestor's padding box (overflow clips there, inside the
   * border). Certain for hidden / clip only.
   */
  hidden: boolean;
  /**
   * Overflow may hide the element but it cannot be told: the ancestor is a
   * scroll container (the element can be scrolled to), a fixed / absolute box
   * lies between and may escape the ancestor, or a scaling / rotating /
   * 3D transform makes clientLeft / clientWidth (which ignore transforms)
   * unusable. A translation alone is fine: it moves the padding box and
   * getBoundingClientRect together.
   */
  unknown: boolean;
  /**
   * clip-path / clip on the element or a rendered ancestor. How much it cuts
   * is not measured.
   */
  clip: boolean;
}

export function measureAncestorClip(el: Element): AncestorClip {
  // A slotted element is drawn inside its slot, so follow assignedSlot before
  // the DOM parent, and cross shadow roots.
  const renderedParent = (node: Element): Element | null =>
    node.assignedSlot ??
    node.parentElement ??
    (node.parentNode instanceof ShadowRoot ? node.parentNode.host : null);
  const isTranslationOnly = (transform: string): boolean => {
    if (transform === 'none') return true;
    const matrix = /^matrix\(([^)]*)\)$/.exec(transform);
    if (!matrix) return false;
    const [a, b, c, d] = (matrix[1] ?? '').split(',').map(Number);
    return a === 1 && b === 0 && c === 0 && d === 1;
  };

  const rect = el.getBoundingClientRect();
  const rootStyle = getComputedStyle(document.documentElement);
  let clip = false;
  let hidden = false;
  let unknown = false;
  let escapes = false;
  let transformed = false;
  // display: contents makes no box, so transform, overflow, clipping and
  // position have no effect on such an element and it is skipped. A
  // non-replaced inline element takes neither overflow nor transform.
  const replaced = new Set([
    'IMG',
    'VIDEO',
    'AUDIO',
    'CANVAS',
    'IFRAME',
    'EMBED',
    'OBJECT',
    'INPUT',
    'SELECT',
    'TEXTAREA',
    'SVG',
  ]);
  const isPlainInline = (node: Element, display: string): boolean =>
    display === 'inline' && !replaced.has(node.tagName.toUpperCase());
  for (let node: Element | null = el; node; node = renderedParent(node)) {
    const style = getComputedStyle(node);
    if (style.display === 'contents' || isPlainInline(node, style.display)) {
      continue;
    }
    if (
      !isTranslationOnly(style.transform) ||
      [style.scale, style.rotate].some((v) => v && v !== 'none')
    ) {
      transformed = true;
    }
  }
  for (let node: Element | null = el; node; node = renderedParent(node)) {
    const style = getComputedStyle(node);
    if (style.display === 'contents') continue;
    const cannotClip = isPlainInline(node, style.display);
    if (style.clipPath !== 'none' || style.clip !== 'auto') clip = true;
    // The root's client size is the viewport's and its rectangle moves with
    // scrolling, so it cannot be compared; the viewport is judged by the
    // caller. The body's overflow moves to the viewport when the root's is
    // visible, so it clips nothing either.
    const isRoot = node === document.documentElement;
    const isViewportBody =
      node === document.body &&
      [rootStyle.overflowX, rootStyle.overflowY].every((v) => v === 'visible');
    if (
      node !== el &&
      !cannotClip &&
      !isRoot &&
      !isViewportBody &&
      [style.overflowX, style.overflowY].some((v) => v !== 'visible')
    ) {
      // clientWidth / clientHeight ignore transforms, so under a scaling or
      // rotating one even an overlap cannot be trusted.
      if (transformed) {
        unknown = true;
      } else {
        // Each axis is cut only where its overflow is not visible; an axis
        // that is not cut counts as overlapping.
        const box = node.getBoundingClientRect();
        const left = box.left + node.clientLeft;
        const top = box.top + node.clientTop;
        const cutsX = style.overflowX !== 'visible';
        const cutsY = style.overflowY !== 'visible';
        const outsideX =
          cutsX &&
          Math.min(rect.right, left + node.clientWidth) <=
            Math.max(rect.left, left);
        const outsideY =
          cutsY &&
          Math.min(rect.bottom, top + node.clientHeight) <=
            Math.max(rect.top, top);
        if (outsideX || outsideY) {
          const isScroll = (v: string): boolean =>
            v === 'auto' || v === 'scroll';
          const scrolls =
            (outsideX && isScroll(style.overflowX)) ||
            (outsideY && isScroll(style.overflowY));
          // overflow-clip-margin pushes the clip line out of the padding box;
          // how far is not worked out.
          const margin = ![style.overflowX, style.overflowY].includes('clip')
            ? '0px'
            : style.getPropertyValue('overflow-clip-margin');
          const marginGrows = margin !== '' && !/^(\S+ )?0px$/.test(margin);
          if (scrolls || escapes || marginGrows) unknown = true;
          else hidden = true;
        }
      }
    }
    if (style.position === 'fixed' || style.position === 'absolute') {
      escapes = true;
    }
  }
  return { hidden, unknown, clip };
}
