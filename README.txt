BOKNINGAR VERSION 2.3 – AUTOMATISKA UPPDATERINGAR

ENGÅNGSINSTALLATION
1. Ladda upp de vanliga appfilerna till GitHub:
   index.html
   firestore.rules
   icon.svg
   _headers
   README.txt

2. Skapa sedan arbetsflödet i GitHub:
   Add file > Create new file
   Filnamn: .github/workflows/install-update.yml
   Klistra in innehållet från filen install-update.yml i detta paket.
   Klicka Commit changes.

EFTER ENGÅNGSINSTALLATIONEN
1. Ladda ner nästa uppdateringsfil.
2. Ändra filnamnet till update.zip om det inte redan heter så.
3. Ladda upp endast update.zip i projektets rot på GitHub.
4. GitHub packar automatiskt upp uppdateringen och tar bort zip-filen.
5. Netlify publicerar därefter den nya versionen automatiskt.

KONTROLL
På GitHub kan du öppna fliken Actions. Körningen
"Installera Bokningar-uppdatering" ska få en grön markering.

OBS
GitHub Actions måste få skriva till projektet. Workflow-filen innehåller
permissions: contents: write. På vissa GitHub-konton kan du dessutom behöva
gå till Settings > Actions > General > Workflow permissions och välja
Read and write permissions.
