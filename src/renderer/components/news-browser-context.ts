import { createContext } from "react";

/** Routes source-preview links through the host's existing browser workbench. */
export const NewsBrowserContext = createContext<((url: string) => void) | undefined>(undefined);
