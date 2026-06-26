import type { MoneyDTO } from '@island/shared';

// The Money view. Deliberately simple: cash in hand, the month's income and
// expense lines, the delta, assets, debts. No net worth, no interest rate, no
// forecast — the player does their own mental accounting (Player Experience doc).
function ec(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}EC$${Math.abs(Math.round(amount)).toLocaleString('en-US')}`;
}

export function Money({ money }: { money: MoneyDTO }) {
  const delta = money.thisMonthDelta;
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
          {money.assets.map((a, i) => (
            <div className="money__line" key={i}>
              <span>{a.label}</span>
              <span className="muted">{a.ownership}</span>
            </div>
          ))}
        </section>
      )}

      {money.debts.length > 0 && (
        <section className="money__section">
          <h3>Debts</h3>
          {money.debts.map((d, i) => (
            <div className="money__line money__line--debt" key={i}>
              <span>{d.label}</span>
              <span>{ec(d.remaining)} remaining</span>
              <span className="muted">
                {ec(d.monthlyPayment)}/month · {d.monthsLeft} months left
              </span>
            </div>
          ))}
        </section>
      )}

      {money.notes.map((n, i) => (
        <p className="money__note" key={i}>
          ⚠ {n}
        </p>
      ))}
    </div>
  );
}
