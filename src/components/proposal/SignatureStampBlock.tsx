import stampImg from "@/assets/sintagma-stamp.png";
import signatureImg from "@/assets/sintagma-signature.png";

/**
 * Подпись и печать ИП Шафрановский М. М. для коммерческих предложений.
 * Используется в шаблоне КП в админке, на публичной странице и в платформенном КП.
 */
export function SignatureStampBlock() {
  return (
    <div
      data-signature-block
      className="mt-6 break-inside-avoid"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="grid grid-cols-[1fr,auto] items-end gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Исполнитель</div>
          <div className="text-sm font-semibold text-gray-900">
            Индивидуальный предприниматель Шафрановский Максим Михайлович
          </div>
          <div className="mt-0.5 text-[11px] text-gray-500">
            ИНН 253615392404 · sintagma.com.ru · +7&nbsp;914&nbsp;721-34-24
          </div>

          <div className="mt-4">
            <div className="relative h-12 w-44">
              <img
                src={signatureImg}
                alt="Подпись"
                className="absolute inset-0 h-full w-full object-contain object-left"
                crossOrigin="anonymous"
              />
            </div>
            <div className="mt-1 border-t border-gray-400 pt-1 text-[10px] text-gray-500 w-44">
              подпись · М.М. Шафрановский
            </div>
          </div>
        </div>

        <div className="relative h-28 w-28 shrink-0 -mb-2">
          <img
            src={stampImg}
            alt="Печать ИП Шафрановский М.М."
            className="h-full w-full object-contain"
            crossOrigin="anonymous"
            style={{ mixBlendMode: "multiply" }}
          />
        </div>
      </div>
    </div>
  );
}
