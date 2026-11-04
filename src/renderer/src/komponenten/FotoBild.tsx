import { useEffect, useState } from 'react';
import { api } from '../api';

/** Ein Foto aus dem Fotoordner. Die Oberfläche bekommt es als data:-Adresse und braucht keinen Dateizugriff. */
export function FotoBild({ name, text, klasse = 'packungsfoto' }: { name: string; text: string; klasse?: string }) {
  const [bild, setBild] = useState<string | null>(null);
  useEffect(() => {
    let abgebrochen = false;
    void api.lebensmittel.fotoLesen(name).then((a) => {
      if (!abgebrochen && a.ok) setBild(a.wert);
    });
    return () => {
      abgebrochen = true;
    };
  }, [name]);
  return bild ? <img className={klasse} src={bild} alt={text} /> : null;
}
