import { LebensmittelDetail } from './LebensmittelDetail';
import { LebensmittelFormular } from './LebensmittelFormular';
import { LebensmittelSuche } from './LebensmittelSuche';

/** Der Reiter „Lebensmittel“: Suche, Detailansicht und Formular hängen am Pfad. */
export function LebensmittelBereich({ unter }: { unter: readonly string[] }) {
  const [erstes, zweites] = unter;
  if (erstes === 'neu') return <LebensmittelFormular key="neu" />;
  if (erstes === 'foto') return <LebensmittelFormular key="foto" perFoto />;
  if (erstes && zweites === 'bearbeiten') return <LebensmittelFormular key={erstes} id={erstes} />;
  if (erstes) return <LebensmittelDetail key={erstes} id={erstes} />;
  return <LebensmittelSuche />;
}
