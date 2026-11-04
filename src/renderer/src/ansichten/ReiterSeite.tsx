import { REITER, type ReiterId } from '../reiter';

/** Noch nicht gefüllte Reiter sagen, was hier kommt. */
export function ReiterSeite({ id }: { id: ReiterId }) {
  const reiter = REITER.find((r) => r.id === id)!;
  return (
    <main className="seite">
      <h1 className="seitentitel">{reiter.titel}</h1>
      <section className="karte kommt-bald">
        <p>{reiter.text}</p>
        <p className="leise">Dieser Bereich kommt in Phase {reiter.phase}.</p>
      </section>
    </main>
  );
}
