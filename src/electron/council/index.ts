import type { CouncilService } from "./CouncilService";

let councilService: CouncilService | null = null;

export function getCouncilService(): CouncilService | null {
  return councilService;
}

export function setCouncilService(service: CouncilService | null): void {
  councilService = service;
}
