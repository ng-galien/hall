import type { HallSettings } from "@hall/domain";
import type { HallSettingsRepository, UnitOfWork, UpdateHallSettings } from "../repositories/contracts.js";

export interface HallSettingsService {
  get(): Promise<HallSettings>;
  update(input: UpdateHallSettings): Promise<HallSettings>;
}

export function createHallSettingsService({
  hallSettingsRepository,
  unitOfWork,
}: {
  hallSettingsRepository: HallSettingsRepository;
  unitOfWork: UnitOfWork;
}): HallSettingsService {
  return {
    get: () => hallSettingsRepository.get(),
    update: (input) => unitOfWork.execute(() => hallSettingsRepository.update(input)),
  };
}
