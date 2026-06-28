import { describe, expect, it } from 'vitest';
import {
  borrowAgainstAsset,
  buildWorld,
  listAssetForSale,
  netWorthOf,
  originateLoan,
  quoteCollateralLoan,
  repossessCollateral,
  resaleQuote,
  resolvePendingSales,
  sellAssetNow,
  SaleError,
} from '../index';
import type { Asset, Venture, WorldState } from '@island/shared';

function worldWithAsset(asset: Asset, seed = 7): WorldState {
  const world = buildWorld(seed, { population: 60 });
  world.player.parish = 'SAINT_JOHN';
  world.player.economicAssets = [asset];
  world.player.ventures = undefined;
  world.player.loanArrearsMonths = 0;
  return world;
}

const vehicle = (): Asset => ({ id: 'A1', type: 'VEHICLE', size: 'MEDIUM', value: 28000 });

describe('resale quotes price speed against value', () => {
  it('a quick sale fetches less than a patient one, both below book value', () => {
    const world = worldWithAsset(vehicle());
    const quick = resaleQuote(world, 'A1', 'QUICK')!;
    const patient = resaleQuote(world, 'A1', 'PATIENT')!;

    expect(quick.price).toBeLessThan(patient.price);
    expect(patient.price).toBeLessThan(28000); // even patient recovers below book
    expect(quick.settlesInMonths).toBe(0);
    expect(patient.settlesInMonths).toBeGreaterThan(0);
  });

  it('an owner in arrears is quoted less (distress)', () => {
    const world = worldWithAsset(vehicle());
    const fair = resaleQuote(world, 'A1', 'PATIENT')!.price;
    world.player.loanArrearsMonths = 2;
    const distressed = resaleQuote(world, 'A1', 'PATIENT')!.price;
    expect(distressed).toBeLessThan(fair);
  });

  it('returns null for an asset the player does not own', () => {
    const world = worldWithAsset(vehicle());
    expect(resaleQuote(world, 'NOPE', 'QUICK')).toBeNull();
  });
});

describe('selling an asset for cash', () => {
  it('a quick sale removes the asset and credits the player', () => {
    const world = worldWithAsset(vehicle());
    world.player.cash = 1000;
    const quote = resaleQuote(world, 'A1', 'QUICK')!;

    const result = sellAssetNow(world, 'A1');
    expect(result.price).toBe(quote.price);
    expect(world.player.cash).toBe(1000 + quote.price);
    expect(world.player.economicAssets).toHaveLength(0);
  });

  it('selling a venture\'s gear shrinks that venture\'s output and upkeep', () => {
    const world = buildWorld(7, { population: 60 });
    const venture: Venture = {
      id: 'VEN1',
      industry: 'FISHING',
      label: 'your fishing',
      incomeMode: 'SPOT',
      spotBaseIncome: 1500,
      standingContract: null,
      outputScale: 1.6,
      monthlyOperatingCosts: 450,
      assets: [vehicle()],
      status: 'ACTIVE',
    };
    world.player.economicAssets = [];
    world.player.ventures = [venture];

    sellAssetNow(world, 'A1');
    // The only asset is gone: output falls to the hand-work floor, upkeep to zero.
    expect(venture.assets).toHaveLength(0);
    expect(venture.outputScale).toBeCloseTo(0.3, 5);
    expect(venture.monthlyOperatingCosts).toBe(0);
    expect(venture.status).toBe('ACTIVE'); // still earns spot income by hand
  });
});

describe('a patient sale settles later', () => {
  it('lists the asset, then pays out when it comes due', () => {
    const world = worldWithAsset(vehicle());
    world.player.cash = 0;
    const sale = listAssetForSale(world, 'A1');

    // Listed but not yet sold: still owned, marked, and pending.
    expect(world.player.economicAssets).toHaveLength(1);
    expect(world.player.economicAssets[0]!.listedForSale).toBe(true);
    expect(world.player.pendingSales).toHaveLength(1);

    // Before it comes due, nothing settles.
    world.month = sale.resolveMonth - 1;
    resolvePendingSales(world);
    expect(world.player.economicAssets).toHaveLength(1);

    // At (or after) the resolve month it settles: asset gone, cash paid, queue clear.
    world.month = sale.resolveMonth;
    resolvePendingSales(world);
    expect(world.player.economicAssets).toHaveLength(0);
    expect(world.player.cash).toBeGreaterThan(0);
    expect(world.player.pendingSales).toHaveLength(0);
  });
});

describe('collateral: pledging and seizure', () => {
  it('a pledged asset is marked and cannot be sold', () => {
    const world = worldWithAsset(vehicle());
    const loan = originateLoan(world, world.player, 'NCB', 20000, 0.1, 400, 60, undefined, 'A1');

    expect(loan.collateralAssetId).toBe('A1');
    expect(world.player.economicAssets[0]!.pledgedToLoanId).toBe(loan.id);
    expect(() => sellAssetNow(world, 'A1')).toThrow(SaleError);
  });

  it('a defaulted secured loan is repossessed: asset seized, balance reduced once', () => {
    const world = worldWithAsset(vehicle());
    const loan = originateLoan(world, world.player, 'NCB', 20000, 0.1, 400, 60, undefined, 'A1');
    loan.remainingPrincipal = 20000;
    loan.status = 'DEFAULT';

    const seized = repossessCollateral(world);
    expect(seized).toBe(1);
    expect(world.player.economicAssets).toHaveLength(0);
    // Forced recovery = 28000 * 0.7 (vehicle) * 0.75 (fire sale) = 14700.
    expect(loan.remainingPrincipal).toBe(20000 - 14700);
    expect(loan.collateralRepossessed).toBe(true);

    // Idempotent — a second pass seizes nothing more.
    expect(repossessCollateral(world)).toBe(0);
  });

  it('repossession clears a loan whose collateral covers the balance', () => {
    const world = worldWithAsset(vehicle());
    const loan = originateLoan(world, world.player, 'NCB', 10000, 0.1, 200, 60, undefined, 'A1');
    loan.remainingPrincipal = 10000; // below the 14,700 recovery
    loan.status = 'DEFAULT';

    repossessCollateral(world);
    expect(loan.remainingPrincipal).toBe(0);
    expect(loan.status).toBe('PAID');
  });
});

describe('borrowing against an asset', () => {
  // A self-employed earner so the bank has steady income to lend against.
  function borrowerWorld(): WorldState {
    const world = worldWithAsset({ id: 'LAND1', type: 'LAND', size: 'MEDIUM', value: 40000 });
    const p = world.player;
    p.employmentStatus = 'SELF_EMPLOYED';
    p.occupation = 'AGRICULTURE';
    p.monthlyIncome = 2200;
    p.cash = 3000;
    return world;
  }

  it('quotes a loan secured by the asset without mutating the world', () => {
    const world = borrowerWorld();
    const quote = quoteCollateralLoan(world, 'LAND1', 36);
    expect(quote.assetId).toBe('LAND1');
    expect(quote.collateralValue).toBe(40000);
    expect(quote.outcome).toMatch(/APPROVED|COUNTER/);
    expect(quote.approvedPrincipal).toBeGreaterThan(0);
    // Read-only: nothing was pledged or paid out.
    expect(world.player.economicAssets[0]!.pledgedToLoanId).toBeUndefined();
    expect(world.player.loans).toHaveLength(0);
  });

  it('books a secured loan, pledges the asset, and pays out the cash', () => {
    const world = borrowerWorld();
    const cashBefore = world.player.cash;
    const { loan } = borrowAgainstAsset(world, 'LAND1', 8000, 36);

    expect(loan.collateralAssetId).toBe('LAND1');
    expect(world.player.economicAssets[0]!.pledgedToLoanId).toBe(loan.id);
    expect(world.player.cash).toBe(cashBefore + loan.principal);
    expect(loan.principal).toBeLessThanOrEqual(8000); // a COUNTER may lend less
    // The pledged asset can no longer be sold.
    expect(() => sellAssetNow(world, 'LAND1')).toThrow(SaleError);
  });

  it('refuses to lend with no steady income to service the loan', () => {
    const world = worldWithAsset({ id: 'LAND1', type: 'LAND', size: 'MEDIUM', value: 40000 });
    world.player.employmentStatus = 'UNEMPLOYED';
    world.player.monthlyIncome = 0;
    expect(() => borrowAgainstAsset(world, 'LAND1', 8000, 36)).toThrow();
  });
});

describe('net worth reflects sales and seizures', () => {
  it('a quick sale leaves net worth lower only by the haircut, not the whole asset', () => {
    const world = worldWithAsset(vehicle());
    world.player.cash = 0;
    world.player.loans = [];
    const before = netWorthOf(world.player); // cash 0 + 28000 asset
    sellAssetNow(world, 'A1');
    const after = netWorthOf(world.player); // cash = quick price, asset gone
    expect(after).toBeLessThan(before);
    expect(before - after).toBeLessThan(28000); // lost only the discount, not the asset
  });
});
