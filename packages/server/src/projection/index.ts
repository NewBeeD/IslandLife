// THE ICEBERG BOUNDARY (architecture doc). Every DTO the client receives is built
// here, and only here is hidden engine state read and stripped. The iceberg-leak
// contract test (P-X1) snapshots every mapper's output and asserts no denylisted
// key ever appears. If a mapper starts leaking, that test fails — by design it is
// the single most important test in the project.
export { toStateDTO } from './state';
export { toMoneyDTO } from './money';
export { toFeedDTO } from './feed';
export { toCommunityDTO } from './community';
export { toOpportunitiesDTO } from './opportunities';
export { toSkillsDTO } from './skills';
export { toJobsDTO, toTakeJobResultDTO } from './jobs';
export { toDecisionDTO, toFinancingQuoteDTO } from './decisions';
export { toVentureActionResultDTO } from './ventures';
export {
  toForecastLines,
  toInformationOffer,
  toInformationPurchaseResultDTO,
} from './forecast';
export { toEducationStatusDTO, toEducationActionResultDTO } from './education';
export {
  toAssetSaleResultDTO,
  toCollateralQuoteDTO,
  toBorrowResultDTO,
  toLoanActionResultDTO,
} from './assets';
