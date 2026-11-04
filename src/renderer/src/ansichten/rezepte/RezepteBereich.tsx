import { RezeptDetail } from './RezeptDetail';
import { RezepteListe } from './RezepteListe';
import { RezeptFormular } from './RezeptFormular';

/** Der Reiter „Rezepte“: Liste, Rezept und Formular hängen am Pfad. */
export function RezepteBereich({ unter }: { unter: readonly string[] }) {
  const [erstes, zweites] = unter;
  if (erstes === 'neu') return <RezeptFormular key="neu" />;
  if (erstes && zweites === 'bearbeiten') return <RezeptFormular key={`${erstes}-bearbeiten`} id={erstes} />;
  if (erstes && zweites === 'kopie') return <RezeptFormular key={`${erstes}-kopie`} id={erstes} alsKopie />;
  if (erstes) return <RezeptDetail key={erstes} id={erstes} />;
  return <RezepteListe />;
}
