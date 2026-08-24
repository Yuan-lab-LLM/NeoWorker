import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import "./neo-worker-select-menu.css";
import { translate } from "../i18n/index";

export interface NeoWorkerSelectOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
}

interface NeoWorkerSelectMenuProps {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  icon?: ReactNode;
  minMenuWidth?: number;
  onValueChange: (value: string) => void;
  options: NeoWorkerSelectOption[];
  placeholder?: string;
  value: string;
}

interface MenuPosition {
  left: number;
  maxHeight: number;
  placement: "top" | "bottom";
  top: number;
  width: number;
}

export function NeoWorkerSelectMenu({
  ariaLabel,
  className = "",
  disabled = false,
  icon,
  minMenuWidth = 260,
  onValueChange,
  options,
  placeholder = translate(
    "generated.components.neoworkerselectmenu.50.0",
    "Please select",
  ),
  value,
}: NeoWorkerSelectMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selectedOption = options[selectedIndex];

  const measureMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const menuWidth = Math.min(
      Math.max(rect.width, minMenuWidth),
      window.innerWidth - viewportPadding * 2,
    );
    const estimatedHeight = Math.min(
      360,
      Math.max(
        72,
        options.reduce(
          (height, option) => height + (option.description ? 56 : 42),
          12,
        ),
      ),
    );
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const placement =
      spaceBelow < estimatedHeight && spaceAbove > spaceBelow
        ? "top"
        : "bottom";
    const availableHeight = placement === "top" ? spaceAbove : spaceBelow;

    setPosition({
      left: Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - menuWidth - viewportPadding),
      ),
      maxHeight: Math.max(88, Math.min(estimatedHeight, availableHeight - 8)),
      placement,
      top: placement === "top" ? rect.top - 7 : rect.bottom + 7,
      width: menuWidth,
    });
  }, [minMenuWidth, options]);

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  const openMenu = useCallback(
    (index = selectedIndex) => {
      if (disabled || options.length === 0) return;
      measureMenu();
      setActiveIndex(index);
      setOpen(true);
    },
    [disabled, measureMenu, options.length, selectedIndex],
  );

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      optionRefs.current[activeIndex]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) return;

    const isInsideMenu = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false;
      return Boolean(
        rootRef.current?.contains(target) ||
        popoverRef.current?.contains(target),
      );
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!isInsideMenu(event.target)) closeMenu();
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (!isInsideMenu(event.target)) closeMenu();
    };
    const handleScroll = (event: Event) => {
      if (!popoverRef.current?.contains(event.target as Node)) closeMenu();
    };
    const handleResize = () => measureMenu();

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [closeMenu, measureMenu, open]);

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") {
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      setActiveIndex(options.length - 1);
      return;
    }
    const direction = event.key === "ArrowDown" ? 1 : -1;
    setActiveIndex(
      (current) => (current + direction + options.length) % options.length,
    );
  };

  const popoverStyle: CSSProperties | undefined = position
    ? {
        left: position.left,
        maxHeight: position.maxHeight,
        top: position.top,
        width: position.width,
      }
    : undefined;

  return (
    <div className={`neoworker-select-menu ${className}`.trim()} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="neoworker-select-trigger"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled || options.length === 0}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={(event) => {
          if (
            open ||
            !["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)
          ) {
            return;
          }
          event.preventDefault();
          openMenu(
            event.key === "ArrowUp" ? options.length - 1 : selectedIndex,
          );
        }}
      >
        {icon ? (
          <span className="neoworker-select-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="neoworker-select-value">
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          className="neoworker-select-chevron"
          size={15}
          strokeWidth={1.9}
          aria-hidden="true"
        />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            className="neoworker-select-popover"
            data-placement={position.placement}
            style={popoverStyle}
            onKeyDown={handleMenuKeyDown}
          >
            <div
              id={listboxId}
              className="neoworker-select-options"
              role="listbox"
              aria-label={ariaLabel}
            >
              {options.map((option, index) => {
                const selected = option.value === value;
                return (
                  <button
                    key={option.value}
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    type="button"
                    className={`neoworker-select-option${selected ? " selected" : ""}`}
                    role="option"
                    aria-selected={selected}
                    title={option.description}
                    onClick={() => {
                      onValueChange(option.value);
                      closeMenu(true);
                    }}
                  >
                    <span className="neoworker-select-option-copy">
                      <span>
                        <strong>{option.label}</strong>
                        {option.badge ? <em>{option.badge}</em> : null}
                      </span>
                      {option.description ? (
                        <small>{option.description}</small>
                      ) : null}
                    </span>
                    <span className="neoworker-select-check" aria-hidden="true">
                      {selected ? <Check size={15} strokeWidth={2.2} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
