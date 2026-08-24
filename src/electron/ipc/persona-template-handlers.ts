import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/types";
import type { ActivatePersonaTemplateRequest, PersonaTemplateCategory } from "../../shared/types";
import type { PersonaTemplateService } from "../agents/PersonaTemplateService";
import { rateLimiter } from "../utils/rate-limiter";
import { validateInput, UUIDSchema } from "../utils/validation";

/**
 * Rate limit check helper
 */
function checkRateLimit(channel: string): void {
  if (!rateLimiter.check(channel)) {
    throw new Error(`Rate limit exceeded for ${channel}`);
  }
}

/**
 * Dependencies for Persona Template handlers
 */
export interface PersonaTemplateDeps {
  personaTemplateService: PersonaTemplateService;
}

/**
 * Set up Persona Template IPC handlers for the Digital Twin system
 */
export function setupPersonaTemplateHandlers(deps: PersonaTemplateDeps): void {
  const { personaTemplateService } = deps;
  const ensureInitialized = async (): Promise<void> => {
    await personaTemplateService.initialize();
  };

  // List all persona templates, optionally filtered
  ipcMain.handle(
    IPC_CHANNELS.PERSONA_TEMPLATE_LIST,
    async (_, filter?: { category?: PersonaTemplateCategory; tag?: string }) => {
      await ensureInitialized();
      return personaTemplateService.listTemplates(filter);
    },
  );

  // Get a single persona template by ID
  ipcMain.handle(IPC_CHANNELS.PERSONA_TEMPLATE_GET, async (_, id: string) => {
    await ensureInitialized();
    if (!id || typeof id !== "string") {
      throw new Error("Template ID is required");
    }
    return personaTemplateService.getTemplate(id);
  });

  // Activate (instantiate) a persona template into an AgentRole
  ipcMain.handle(
    IPC_CHANNELS.PERSONA_TEMPLATE_ACTIVATE,
    async (_, request: ActivatePersonaTemplateRequest) => {
      await ensureInitialized();
      checkRateLimit(IPC_CHANNELS.PERSONA_TEMPLATE_ACTIVATE);

      if (!request || !request.templateId) {
        throw new Error("Template ID is required for activation");
      }

      if (request.customization?.companyId) {
        request = {
          ...request,
          customization: {
            ...request.customization,
            companyId: validateInput(UUIDSchema, request.customization.companyId, "company ID"),
          },
        };
      }

      return personaTemplateService.activate(request);
    },
  );

  // Preview what will be created without actually creating it
  ipcMain.handle(IPC_CHANNELS.PERSONA_TEMPLATE_PREVIEW, async (_, templateId: string) => {
    await ensureInitialized();
    if (!templateId || typeof templateId !== "string") {
      throw new Error("Template ID is required");
    }
    return personaTemplateService.previewActivation(templateId);
  });

  // Get all categories with counts
  ipcMain.handle(IPC_CHANNELS.PERSONA_TEMPLATE_GET_CATEGORIES, async () => {
    await ensureInitialized();
    return personaTemplateService.getCategories();
  });
}
