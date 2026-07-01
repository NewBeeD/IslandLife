import { useCallback, useEffect, useState } from 'react';
import type { AssetLine, CollateralQuoteDTO, DebtLine, MoneyDTO, SaleMode } from '@island/shared';
import { api } from '../api/client';

// Selectable repayment terms for a loan secured by an asset (1–5 years).
const BORROW_TERM_OPTIONS = [12, 24, 36, 48, 60];

// The Money view. Cash in hand, the month's income and expense lines, the delta,
// and (Phase 7) the player's own books in full: asset values, each loan's interest
// rate and interest/principal split, and net worth. Phase 12: each asset can be
// sold — quick for cash now, or listed for a fuller price after a wait.
function ec(amount: number): string {
  if (!Number.isFinite(amount)) amount = 0; // never render EC$NaN
  const sign = amount < 0 ? '-' : '';
  return `${sign}EC$${Math.abs(Math.round(amount)).toLocaleString('en-US')}`;
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

export function Money({
  money,
  saveId,
  onChanged,
}: {
  money: MoneyDTO;
  saveId: string;
  onChanged: () => void;
}) {
  const delta = money.thisMonthDelta;
  const [selling, setSelling] = useState<string | null>(null);
  const [borrowAgainst, setBorrowAgainst] = useState<string | null>(null);
  const [venturing, setVenturing] = useState<string | null>(null);

  const sell = async (assetId: string, mode: SaleMode) => {
    setSelling(assetId);
    try {
      await api.sellAsset(saveId, assetId, mode);
      onChanged();
    } finally {
      setSelling(null);
    }
  };

  const ventureAct = async (ventureId: string, action: 'discontinue' | 'shelve' | 'reopen') => {
    setVenturing(ventureId);
    try {
      await api.ventureAction(saveId, ventureId, action);
      onChanged();
    } finally {
      setVenturing(null);
    }
  };
  return (
    <div className="money">
      <div className="money__cash">
        <span>Cash in hand</span>
        <strong>{ec(money.cashInHand)}</strong>
      </div>

      <section className="money__section">
        <h3>Money coming in</h3>
        {money.income.lines.map((l, i) => (
          <div className="money__line" key={i}>
            <span>{l.label}</span>
            <span>{ec(l.amount)}</span>
          </div>
        ))}
        <div className="money__line money__line--total">
          <span>Total in</span>
          <span>{ec(money.income.total)}</span>
        </div>
      </section>

      <section className="money__section">
        <h3>Money going out</h3>
        {money.expenses.lines.map((l, i) => (
          <div className="money__line" key={i}>
            <span>{l.label}</span>
            <span>{ec(l.amount)}</span>
          </div>
        ))}
        <div className="money__line money__line--total">
          <span>Total out</span>
          <span>{ec(money.expenses.total)}</span>
        </div>
      </section>

      <div className={`money__delta ${delta >= 0 ? 'pos' : 'neg'}`}>
        <span>This month</span>
        <strong>
          {delta >= 0 ? '+' : ''}
          {ec(delta)}
        </strong>
      </div>

      {money.assets.length > 0 && (
        <section className="money__section">
          <h3>Assets</h3>
          {money.assets.map((a) => (
            <div className="money__asset" key={a.id}>
              <div className="money__line">
                <span>{a.label}</span>
                <span>{ec(a.value)}</span>
                <span className="muted">
                  {a.pledged ? 'pledged against a loan' : a.listedForSale ? 'listed for sale' : a.ownership}
                </span>
              </div>
              {a.resale && (
                <div className="money__sell">
                  <button
                    type="button"
                    disabled={selling === a.id}
                    onClick={() => sell(a.id, 'QUICK')}
                  >
                    Sell now · {ec(a.resale.quickPrice)}
                  </button>
                  <button
                    type="button"
                    disabled={selling === a.id}
                    onClick={() => sell(a.id, 'PATIENT')}
                  >
                    List for sale · {ec(a.resale.patientPrice)} in ~{a.resale.settlesInMonths} mo
                  </button>
                  <button
                    type="button"
                    disabled={selling === a.id}
                    onClick={() => setBorrowAgainst(borrowAgainst === a.id ? null : a.id)}
                  >
                    {borrowAgainst === a.id ? 'Cancel' : 'Borrow against it'}
                  </button>
                </div>
              )}
              {borrowAgainst === a.id && (
                <BorrowPanel
                  saveId={saveId}
                  asset={a}
                  onDone={() => {
                    setBorrowAgainst(null);
                    onChanged();
                  }}
                  onCancel={() => setBorrowAgainst(null)}
                />
              )}
            </div>
          ))}
        </section>
      )}

      {money.ventures && money.ventures.length > 0 && (
        <section className="money__section">
          <h3>Your ventures</h3>
          {money.ventures.map((v) => (
            <div className="money__asset" key={v.id}>
              <div className="money__line">
                <span>{v.label}</span>
                <span>
                  {v.status === 'SHELVED' ? '—' : `${ec(v.monthlyIncome)}/mo`}
                </span>
                <span className="muted">
                  {v.status === 'SHELVED'
                    ? 'shelved'
                    : v.operated
                      ? 'run by someone you took on'
                      : 'you run it'}
                  {v.monthlyUpkeep >= 1 ? ` · upkeep ${ec(v.monthlyUpkeep)}` : ''}
                </span>
              </div>
              <div className="money__sell">
                {v.status === 'SHELVED' ? (
                  <button
                    type="button"
                    disabled={venturing === v.id}
                    onClick={() => ventureAct(v.id, 'reopen')}
                  >
                    Pick it back up
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={venturing === v.id}
                    onClick={() => ventureAct(v.id, 'shelve')}
                  >
                    Set it down for now
                  </button>
                )}
                <button
                  type="button"
                  disabled={venturing === v.id}
                  onClick={() => ventureAct(v.id, 'discontinue')}
                >
                  Wind it down
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {money.debts.length > 0 && (
        <section className="money__section">
          <h3>Debts</h3>
          {money.debts.map((d) => (
            <DebtRow
              key={d.loanId}
              saveId={saveId}
              debt={d}
              cashInHand={money.cashInHand}
              onChanged={onChanged}
            />
          ))}
        </section>
      )}

      {(money.marketMood || (money.marketWatch && money.marketWatch.length > 0)) && (
        <section className="money__section">
          <h3>At the market</h3>
          {money.marketMood && <p className="money__note muted">{money.marketMood}</p>}
          {(money.marketWatch ?? []).map((m, i) => (
            <div className="money__line" key={i}>
              <span>{m.label}</span>
              <span>
                EC${m.price.toLocaleString('en-US')}/{m.unit}
              </span>
              <span className="muted">
                {m.trend === 'STRONG'
                  ? 'fetching a strong price'
                  : m.trend === 'WEAK'
                    ? 'a poor price right now'
                    : 'about the usual'}
              </span>
            </div>
          ))}
        </section>
      )}

      {money.ownership && money.ownership.length > 0 && (
        <section className="money__section">
          <h3>Who owns what</h3>
          {money.ownership.map((o, i) => (
            <div className="money__line money__line--debt" key={i}>
              <span>{o.label}</span>
              <span>{o.yourSharePct}% yours</span>
              <span className="muted">
                {o.holders.map((h) => `${h.name} ${h.sharePct}%`).join(' · ')}
              </span>
            </div>
          ))}
        </section>
      )}

      {money.standing && (
        <section className="money__section">
          <h3>Your name</h3>
          <p className="money__note muted">{money.standing}</p>
        </section>
      )}

      <div className="money__networth">
        <span>Net worth</span>
        <strong>{ec(money.netWorth)}</strong>
      </div>

      {money.notes.map((n, i) => (
        <p className="money__note" key={i}>
          ⚠ {n}
        </p>
      ))}
    </div>
  );
}

// One debt, with the paid-vs-remaining picture and (Phase 14) the controls to pay it
// off early or resize the monthly installment. Both act on the player's own loan and
// reload the view on success.
function DebtRow({
  saveId,
  debt,
  cashInHand,
  onChanged,
}: {
  saveId: string;
  debt: DebtLine;
  cashInHand: number;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(Math.min(debt.remaining, Math.max(0, Math.round(cashInHand))));
  const [payment, setPayment] = useState(debt.monthlyPayment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        setOpen(false);
        onChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  const maxRepay = Math.min(debt.remaining, Math.max(0, Math.floor(cashInHand)));

  return (
    <div className="money__line money__line--debt">
      <span>{debt.label}</span>
      <span>{ec(debt.remaining)} remaining</span>
      <span className="muted">
        {ec(debt.monthlyPayment)}/month at {pct(debt.interestRate)} · {debt.monthsLeft} months left
      </span>
      <span className="muted">
        {ec(debt.paidToDate)} paid of {ec(debt.principal)} · this month {ec(debt.interestPortion)}{' '}
        interest, {ec(debt.principalPortion)} principal
      </span>
      <button type="button" className="link" disabled={busy} onClick={() => setOpen(!open)}>
        {open ? 'Close' : 'Pay off or resize'}
      </button>

      {open && (
        <div className="financing">
          <label className="financing__field">
            <span>
              Pay a lump sum: <strong>{ec(amount)}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(maxRepay, 0)}
              step={100}
              value={Math.min(amount, maxRepay)}
              onChange={(e) => setAmount(Number(e.target.value))}
              disabled={busy || maxRepay <= 0}
            />
          </label>
          <div className="financing__actions">
            <button
              className="primary"
              disabled={busy || amount <= 0 || amount > maxRepay}
              onClick={() => run(() => api.repayLoan(saveId, debt.loanId, amount))}
            >
              {amount >= debt.remaining ? 'Clear the loan' : 'Pay this off the balance'}
            </button>
          </div>

          <label className="financing__field">
            <span>
              Or change the monthly payment to <strong>{ec(payment)}</strong>
            </span>
            <input
              type="number"
              min={1}
              step={10}
              value={payment}
              onChange={(e) => setPayment(Number(e.target.value))}
              disabled={busy}
            />
          </label>
          <div className="financing__actions">
            <button
              className="primary"
              disabled={busy || payment <= 0 || payment === debt.monthlyPayment}
              onClick={() => run(() => api.setLoanInstallment(saveId, debt.loanId, payment))}
            >
              Set the installment
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  );
}

// Borrow against an asset the player owns. They drag how much to raise; the panel
// polls the bank for live terms (loan size, monthly payment, the approve/counter/
// decline result). A COUNTER means the bank will lend less than asked — one click
// takes the bank's smaller loan. Booking pledges the asset until the loan is cleared.
function BorrowPanel({
  saveId,
  asset,
  onDone,
  onCancel,
}: {
  saveId: string;
  asset: AssetLine;
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const maxPrincipal = Math.max(500, Math.floor(asset.value / 500) * 500);
  const [principal, setPrincipal] = useState(
    Math.min(maxPrincipal, Math.max(500, Math.round(asset.value * 0.3))),
  );
  const [term, setTerm] = useState(BORROW_TERM_OPTIONS[2] ?? 36);
  const [quote, setQuote] = useState<CollateralQuoteDTO | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live-quote on every change to amount or term (debounced).
  useEffect(() => {
    let cancelled = false;
    setQuoting(true);
    const id = setTimeout(() => {
      api
        .quoteBorrow(saveId, asset.id, term, principal)
        .then((q) => {
          if (!cancelled) setQuote(q);
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (!cancelled) setQuoting(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [saveId, asset.id, principal, term]);

  // Accepting a counter = ask for exactly what the bank will lend.
  const takeCounter = useCallback(() => {
    if (quote) setPrincipal(quote.maxPrincipal);
  }, [quote]);

  const borrow = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await api.borrowAgainstAsset(saveId, asset.id, principal, term);
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [saveId, asset.id, principal, term, onDone]);

  const canBorrow = !!quote && quote.outcome !== 'DECLINED' && quote.maxPrincipal > 0;

  return (
    <div className="financing">
      <div className="financing__head">
        <span>Borrow against {asset.label.toLowerCase()}</span>
        <strong>{ec(asset.value)}</strong>
      </div>

      <label className="financing__field">
        <span>
          Raise <strong>{ec(principal)}</strong>
        </span>
        <input
          type="range"
          min={500}
          max={maxPrincipal}
          step={500}
          value={principal}
          onChange={(e) => setPrincipal(Number(e.target.value))}
          disabled={busy}
        />
      </label>

      <label className="financing__field">
        <span>Pay it back over</span>
        <select value={term} onChange={(e) => setTerm(Number(e.target.value))} disabled={busy}>
          {BORROW_TERM_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t} months ({Math.round(t / 12)} yr)
            </option>
          ))}
        </select>
      </label>

      <div
        className={`financing__quote financing__quote--${quote?.outcome.toLowerCase() ?? 'pending'}`}
      >
        {quoting && !quote && <p className="muted">Asking the bank…</p>}
        {quote && (
          <>
            <div className="financing__line">
              <span>Borrow</span>
              <span>{ec(quote.maxPrincipal)}</span>
            </div>
            {quote.outcome !== 'DECLINED' && (
              <>
                <div className="financing__line">
                  <span>Monthly payment</span>
                  <span>{ec(quote.monthlyPayment)}</span>
                </div>
                <div className="financing__line muted">
                  <span>
                    {quote.bankLabel} · {pct(quote.interestRate)} · {quote.termMonths} months
                  </span>
                </div>
              </>
            )}
            <p className={`financing__reason financing__reason--${quote.outcome.toLowerCase()}`}>
              {quote.reason}
            </p>
            {quote.outcome === 'COUNTER' && quote.maxPrincipal < principal && (
              <button className="financing__counter" onClick={takeCounter} disabled={busy}>
                Take the bank's offer — borrow {ec(quote.maxPrincipal)}
              </button>
            )}
          </>
        )}
      </div>

      <div className="financing__actions">
        <button className="primary" onClick={borrow} disabled={busy || !canBorrow}>
          {busy ? 'Signing…' : 'Take the loan'}
        </button>
        <button className="decision__back" onClick={onCancel} disabled={busy}>
          Not now
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
