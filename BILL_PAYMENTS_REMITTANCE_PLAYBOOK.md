# Bill Payments Remittance Playbook

## EN
### Purpose
- Keep bill payments operational with the highest safe automation available in the current system.

### What is automated now
- Customer funding is automatic at payment time.
- Remittance queue processing is automatic for configured/supported routes.
- Supported routes can be enabled by configuration:
  - `BILL_REMITTANCE_SYNCHRONY_AUTOSUBMIT=true`
  - `BILL_REMITTANCE_AUTOSUBMIT_CHANNELS=channel_a,channel_b`
  - `BILL_REMITTANCE_AUTOSUBMIT_PROVIDERS=provider one,provider two`

### What is still manual
- Providers without an enabled auto route remain `pending_submission`.
- Team must submit payment in provider portal and then mark remittance as submitted.

### Daily operations
1. Run remittance processor:
   - `./scripts/run-bill-remittance.ps1 -Limit 50`
2. Review failures and skipped items.
3. Submit manual providers in their portal.
4. Mark transaction remittance status via API/UI as `submitted` with a reference.
5. Re-run processor to clear remaining eligible items.

### Quick checks
- Funding captured with remittance pending:
  - `status=paid/processing` on transaction and `remittance_status=pending_submission`.
- Final settled bill:
  - Bill status becomes `paid` after remittance submitted.

---

## ES
### Objetivo
- Mantener pagos de bills operativos con la mayor automatizacion segura posible en el sistema actual.

### Que esta automatizado hoy
- El cobro al cliente es automatico al momento del pago.
- El procesamiento de cola de remittance es automatico para rutas soportadas/configuradas.
- Se puede habilitar por configuracion:
  - `BILL_REMITTANCE_SYNCHRONY_AUTOSUBMIT=true`
  - `BILL_REMITTANCE_AUTOSUBMIT_CHANNELS=canal_a,canal_b`
  - `BILL_REMITTANCE_AUTOSUBMIT_PROVIDERS=proveedor uno,proveedor dos`

### Que sigue siendo manual
- Proveedores sin ruta automatica quedan en `pending_submission`.
- El equipo debe pagar en el portal del proveedor y luego marcar el remittance como submitted.

### Operacion diaria
1. Ejecutar procesador de remittance:
   - `./scripts/run-bill-remittance.ps1 -Limit 50`
2. Revisar fallos y items omitidos.
3. Enviar pagos manuales en portal del proveedor.
4. Marcar estado de remittance de la transaccion como `submitted` con referencia.
5. Volver a ejecutar el procesador para limpiar items elegibles restantes.

### Chequeos rapidos
- Cobro capturado con remittance pendiente:
  - `status=paid/processing` en transaccion y `remittance_status=pending_submission`.
- Bill liquidado final:
  - El bill pasa a `paid` despues de remittance submitted.

---

## PL
### Cel
- Utrzymac platnosci bills z maksymalna bezpieczna automatyzacja dostepna w obecnym systemie.

### Co jest teraz zautomatyzowane
- Obciazenie klienta odbywa sie automatycznie podczas platnosci.
- Przetwarzanie kolejki remittance jest automatyczne dla skonfigurowanych/wspieranych tras.
- Mozna wlaczyc przez konfiguracje:
  - `BILL_REMITTANCE_SYNCHRONY_AUTOSUBMIT=true`
  - `BILL_REMITTANCE_AUTOSUBMIT_CHANNELS=kanal_a,kanal_b`
  - `BILL_REMITTANCE_AUTOSUBMIT_PROVIDERS=dostawca jeden,dostawca dwa`

### Co pozostaje reczne
- Dostawcy bez wlaczonej trasy auto pozostaja jako `pending_submission`.
- Zespol musi wykonac platnosc w portalu dostawcy i oznaczyc remittance jako submitted.

### Dzienna operacja
1. Uruchom procesor remittance:
   - `./scripts/run-bill-remittance.ps1 -Limit 50`
2. Sprawdz bledy i pominiete pozycje.
3. Wyslij reczne platnosci w portalu dostawcy.
4. Oznacz status remittance transakcji jako `submitted` z numerem referencyjnym.
5. Uruchom procesor ponownie, aby wyczyscic pozostale kwalifikowane pozycje.

### Szybkie kontrole
- Srodki pobrane, remittance oczekuje:
  - `status=paid/processing` na transakcji i `remittance_status=pending_submission`.
- Koncowe rozliczenie bill:
  - Bill przechodzi na `paid` po remittance submitted.
