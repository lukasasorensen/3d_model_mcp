"use client";
import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent,
  type DOMAttributes,
} from "react";

interface Drag {
  pointerId: number;
  id: string;
  clientY: number;
  handle: HTMLButtonElement;
}
const edgeSize = 32;
const scrollStep = 10;

type GripHandlers = Pick<
  DOMAttributes<HTMLButtonElement>,
  | "onPointerDown"
  | "onPointerMove"
  | "onPointerUp"
  | "onPointerCancel"
  | "onLostPointerCapture"
>;
interface DropMarker {
  before: string | null;
}
export function useLayerDrag(
  order: readonly string[],
  disabled: boolean,
  move: (id: string, offset: number) => void,
): {
  list: RefObject<HTMLOListElement | null>;
  marker: DropMarker | null;
  grip(id: string): GripHandlers;
} {
  const list = useRef<HTMLOListElement>(null);
  const drag = useRef<Drag | null>(null);
  const [marker, setMarker] = useState<DropMarker | null>(null);

  function insertion(): { before: string | null; index: number } {
    const items = Array.from(list.current?.children ?? []).filter(
      (row): row is HTMLElement =>
        row instanceof HTMLElement && row.dataset.objectId !== drag.current?.id,
    );
    const index = items.findIndex((row) => {
      const rect = row.getBoundingClientRect();
      return drag.current!.clientY < rect.top + rect.height / 2;
    });
    return {
      before: items[index]?.dataset.objectId ?? null,
      index: index < 0 ? items.length : index,
    };
  }
  function cancel(): void {
    const active = drag.current;
    drag.current = null;
    if (active?.handle.hasPointerCapture(active.pointerId))
      active.handle.releasePointerCapture(active.pointerId);
    setMarker(null);
  }
  useEffect(() => {
    if (!marker || !drag.current) return;
    const escape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    let frame: number;
    function update(): void {
      const active = drag.current;
      const el = list.current;
      if (!active || !el) return;
      if (!el.getClientRects().length || disabled) {
        cancel();
        return;
      }
      const rect = el.getBoundingClientRect();
      const y = active.clientY;
      if (y < rect.top + edgeSize) el.scrollTop -= scrollStep;
      else if (y > rect.bottom - edgeSize) el.scrollTop += scrollStep;
      const { before } = insertion();
      setMarker((previous) =>
        previous?.before === before ? previous : { before },
      );
      frame = requestAnimationFrame(update);
    }
    frame = requestAnimationFrame(update);
    document.addEventListener("keydown", escape, true);
    return (): void => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", escape, true);
    };
  }, [marker, disabled]);
  function grip(id: string): GripHandlers {
    return {
      onPointerDown(event: PointerEvent<HTMLButtonElement>): void {
        if (disabled || !event.isPrimary || event.button !== 0 || drag.current)
          return;
        event.preventDefault();
        const handle = event.currentTarget;
        handle.focus({ preventScroll: true });
        handle.setPointerCapture(event.pointerId);
        drag.current = {
          id,
          pointerId: event.pointerId,
          handle,
          clientY: event.clientY,
        };
        setMarker({ before: insertion().before });
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>): void {
        if (drag.current?.pointerId === event.pointerId)
          drag.current.clientY = event.clientY;
      },
      onPointerUp(event: PointerEvent<HTMLButtonElement>): void {
        if (drag.current?.pointerId !== event.pointerId) return;
        drag.current.clientY = event.clientY;
        const offset = insertion().index - order.indexOf(id);
        cancel();
        if (!disabled && offset) move(id, offset);
      },
      onPointerCancel(event: PointerEvent<HTMLButtonElement>): void {
        if (drag.current?.pointerId === event.pointerId) cancel();
      },
      onLostPointerCapture(event: PointerEvent<HTMLButtonElement>): void {
        if (drag.current?.pointerId === event.pointerId) cancel();
      },
    };
  }
  return { list, marker, grip };
}
