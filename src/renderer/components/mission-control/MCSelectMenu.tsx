import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { translate } from "../../i18n/index";

export interface MCSelectMenuOption {
  value: string;
  label: string;
  keywords?: string;
}

interface MCSelectMenuProps {
  ariaLabel: string;
  className?: string;
  icon?: ReactNode;
  minMenuWidth?: number;
  onValueChange: (value: string) => void;
  options: MCSelectMenuOption[];
  prefix?: string;
  searchPlaceholder?: string;
  value: string;
}

interface MenuPosition {
  left: number;
  maxHeight: number;
  placement: "top" | "bottom";
  top: number;
  width: number;
}

export function MCSelectMenu({
  ariaLabel,
  className = "",
  icon,
  minMenuWidth = 220,
  onValueChange,
  options,
  prefix,
  searchPlaceholder,
  value,
}: MCSelectMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const selectedOption =
    options.find((option) => option.value === value) ?? options[0];
  const visibleOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) =>
      `${option.label} ${option.keywords ?? ""}`
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [options, query]);

  const closeMenu = () => {
    setOpen(false);
    setQuery("");
  };

  const measureMenu = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 10;
    const menuWidth = Math.min(
      Math.max(rect.width, minMenuWidth),
      window.innerWidth - viewportPadding * 2,
    );
    const estimatedHeight = Math.min(
      searchPlaceholder ? 330 : 290,
      options.length * 36 + (searchPlaceholder ? 66 : 16),
    );
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const placement =
      spaceBelow < estimatedHeight && spaceAbove > spaceBelow
        ? "top"
        : "bottom";
    const maxHeight = Math.max(
      140,
      Math.min(
        estimatedHeight,
        placement === "top" ? spaceAbove - 6 : spaceBelow - 6,
      ),
    );
    const unclampedLeft = rect.left;
    const left = Math.max(
      viewportPadding,
      Math.min(unclampedLeft, window.innerWidth - menuWidth - viewportPadding),
    );

    setPosition({
      left,
      maxHeight,
      placement,
      top: placement === "top" ? rect.top - 6 : rect.bottom + 6,
      width: menuWidth,
    });
  };

  const toggleMenu = () => {
    if (open) {
      closeMenu();
      return;
    }
    measureMenu();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeMenu();
      triggerRef.current?.focus();
    };
    const handleViewportChange = () => measureMenu();

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    searchRef.current?.focus();

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open]);

  const popoverStyle: CSSProperties | undefined = position
    ? {
        backgroundColor: "var(--mc-select-menu-surface, #ffffff)",
        left: position.left,
        maxHeight: position.maxHeight,
        top: position.top,
        width: position.width,
        zIndex: 2_147_483_000,
      }
    : undefined;

  return (
    <div
      ref={rootRef}
      className={`mc-select-menu ${className}`.trim()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        className="mc-select-menu-trigger"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={toggleMenu}
        onKeyDown={(event) => {
          if (!open && ["ArrowDown", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            measureMenu();
            setOpen(true);
          }
        }}
      >
        {icon ? (
          <span className="mc-select-menu-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="mc-select-menu-value">
          {prefix ? <small>{prefix}</small> : null}
          <span>{selectedOption?.label ?? ""}</span>
        </span>
        <ChevronDown
          className="mc-select-menu-chevron"
          size={13}
          aria-hidden="true"
        />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            className="mc-select-menu-popover"
            data-placement={position.placement}
            style={popoverStyle}
          >
            {searchPlaceholder ? (
              <label className="mc-select-menu-search">
                <Search size={14} aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                />
              </label>
            ) : null}
            <div
              id={listboxId}
              className="mc-select-menu-options"
              role="listbox"
              aria-label={ariaLabel}
            >
              {visibleOptions.map((option) => {
                const selected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`mc-select-menu-option ${selected ? "selected" : ""}`}
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onValueChange(option.value);
                      closeMenu();
                      triggerRef.current?.focus();
                    }}
                  >
                    <span>{option.label}</span>
                    {selected ? <Check size={14} aria-hidden="true" /> : null}
                  </button>
                );
              })}
              {visibleOptions.length === 0 ? (
                <span className="mc-select-menu-empty">
                  {translate(
                    "generated.components.mission.control.mcselectmenu.265.0",
                    "no match",
                  )}
                </span>
              ) : null}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
