import { LegalPlaceholder, LegalSection } from "./LegalDocumentLayout";
import {
  LEGAL_IDENTITY,
  LEGAL_POLICY_SNIPPETS,
  LEGAL_WEBSITE,
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_ACTIVE,
  controllerCpfDisplay,
} from "@/lib/legal";

export function TermsContent() {
  const cpf = controllerCpfDisplay();

  return (
    <>
      <LegalSection id="identificacao" title="1. Identificação do fornecedor">
        <p>
          Estes Termos de Uso regem o uso da plataforma PetID (“PetID”, “nós” ou “serviço”),
          disponibilizada e operada por pessoa física:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Responsável / fornecedor: <strong>{LEGAL_IDENTITY.responsibleName}</strong>
          </li>
          <li>
            CPF:{" "}
            {cpf.configured ? (
              cpf.label
            ) : (
              <LegalPlaceholder>{cpf.label}</LegalPlaceholder>
            )}
          </li>
          <li>Endereço: {LEGAL_IDENTITY.address}</li>
          <li>
            Site oficial:{" "}
            <a href={LEGAL_WEBSITE} className="text-primary hover:underline">
              {LEGAL_WEBSITE}
            </a>
          </li>
          <li>
            Contato:{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
              {SUPPORT_EMAIL}
            </a>
            {!SUPPORT_EMAIL_ACTIVE ? (
              <>
                {" "}
                (canal oficial em configuração — o endereço ainda pode não estar plenamente
                operacional)
              </>
            ) : null}
          </li>
        </ul>
        <p>
          Ao criar uma conta ou utilizar o PetID, você declara ter lido e concordado com estes
          Termos. Se não concordar, não utilize o serviço.
        </p>
      </LegalSection>

      <LegalSection id="idade" title="2. Idade mínima (18+)">
        <p>{LEGAL_POLICY_SNIPPETS.ageMinimum}</p>
        <p>
          No cadastro e no aceite dos documentos legais, pedimos a declaração: “
          {LEGAL_POLICY_SNIPPETS.ageDeclaration}”. O PetID não é comercializado como serviço
          destinado a crianças ou adolescentes.
        </p>
        <p>{LEGAL_POLICY_SNIPPETS.ageAssuranceNote}</p>
      </LegalSection>

      <LegalSection id="o-que-e" title="3. O que é o PetID">
        <p>
          O PetID é uma plataforma digital para organização da identidade e do cuidado de pets.
          Dependendo do plano e das configurações do usuário, o serviço pode incluir, entre outras
          funcionalidades:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Perfis digitais de pets, com dados cadastrais e foto.</li>
          <li>Perfil público acessível por link ou QR Code, com visibilidade controlada pelo tutor.</li>
          <li>Rotinas, histórico e registros relacionados à saúde e ao cuidado do pet.</li>
          <li>Documentos e arquivos associados ao pet.</li>
          <li>Lembretes de rotina, vacinas, medicamentos e compromissos (conforme o plano).</li>
          <li>Assistente informativo com base nos dados fornecidos pelo usuário (conforme o plano).</li>
          <li>Acesso veterinário com permissões concedidas pelo tutor (conforme o plano).</li>
          <li>Colaboração com cuidadores / família (conforme o plano).</li>
          <li>Tags físicas PetID com QR Code, quando ativadas e vinculadas a um pet.</li>
        </ul>
        <p>
          Os planos disponíveis são <strong>Essencial</strong> (gratuito),{" "}
          <strong>Guardião</strong> (R$&nbsp;9,90/mês ou R$&nbsp;99/ano) e{" "}
          <strong>Família</strong> (R$&nbsp;14,90/mês ou R$&nbsp;149/ano). Recursos específicos
          podem variar conforme o plano vigente e a página de preços.
        </p>
      </LegalSection>

      <LegalSection id="conta" title="4. Responsabilidades da conta">
        <p>
          Você é responsável por manter a confidencialidade das suas credenciais de acesso e por
          toda atividade realizada na sua conta.
        </p>
        <p>
          Você deve fornecer informações verdadeiras e atualizadas, especialmente dados de contato
          usados em situações de pet perdido ou emergência.
        </p>
        <p>
          Notifique-nos em caso de uso não autorizado da conta pelo e-mail{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
            {SUPPORT_EMAIL}
          </a>
          {!SUPPORT_EMAIL_ACTIVE ? " (quando o canal estiver operacional)" : null}.
        </p>
        <p>
          Você é responsável pelo conteúdo que cadastra, envia ou compartilha no PetID, incluindo
          dados de pets, documentos e contatos de terceiros.
        </p>
      </LegalSection>

      <LegalSection id="conteudo-usuario" title="5. Conteúdo do usuário">
        <p>
          Você mantém os direitos aplicáveis sobre fotos, documentos e demais conteúdos que enviar
          ao PetID. O PetID <strong>não</strong> reivindica a titularidade desse conteúdo.
        </p>
        <p>
          Ao usar o serviço, você concede ao PetID apenas as permissões necessárias para armazenar,
          processar e exibir o conteúdo a fim de prestar o serviço (incluindo perfil público e
          acessos que você autorizar), conforme a Política de Privacidade.
        </p>
        <p>
          Você declara ter o direito de enviar o conteúdo e não pode carregar material ilegal ou de
          terceiros sem autorização.
        </p>
      </LegalSection>

      <LegalSection id="perfil-publico" title="6. Perfil público e QR Code">
        <p>
          Por padrão, o PetID busca privacidade: informações sensíveis do tutor e dados de saúde do
          pet permanecem ocultos no perfil público, salvo se você habilitar expressamente um campo
          permitido.
        </p>
        <p>
          Qualquer pessoa com o link ou que escaneie o QR Code poderá visualizar somente os campos
          que estiverem marcados como públicos naquele momento. Você controla as configurações de
          visibilidade disponíveis.
        </p>
        <p>
          Dados tornados públicos podem ser vistos por terceiros. Revise as configurações antes de
          compartilhar o link, a tag ou ativar o Modo Perdido.
        </p>
        <p>{LEGAL_POLICY_SNIPPETS.qrNotGps}</p>
      </LegalSection>

      <LegalSection id="modo-perdido" title="7. Modo Perdido">
        <p>
          O Modo Perdido auxilia na identificação e no contato quando um pet é marcado como
          perdido. Ao ativá-lo, você pode tornar públicas, de forma intencional, informações de
          contato/recuperação selecionadas.
        </p>
        <p>
          O Modo Perdido <strong>não</strong> é rastreamento por GPS e não localiza o pet em tempo
          real. Não há garantia de recuperação, de avistamentos ou de que terceiros utilizarão o QR
          Code ou entrarão em contato.
        </p>
      </LegalSection>

      <LegalSection id="tag-fisica" title="8. Tag física PetID">
        <p>{LEGAL_POLICY_SNIPPETS.qrNotGps}</p>
        <p>
          A ativação exige credencial de ativação válida (código de uso único conforme o produto).
          Após a ativação, a tag é vinculada a um pet/conta e não pode ser simplesmente reivindicada
          por outro usuário aleatório. Tags de contas excluídas são desvinculadas/desabilitadas
          conforme a implementação vigente. Reatribuições sensíveis podem exigir suporte/admin.
        </p>
        <p>
          A venda pública com frete automatizado <strong>ainda não está disponível</strong>. Antes
          de habilitar comércio e envio de tags, o PetID deve finalizar: cálculo de frete, prazos,
          responsabilidade de entrega, arrependimento/devolução, vício do produto, garantia legal,
          política de reposição e suporte a código/tag perdidos — sem reduzir direitos obrigatórios
          do consumidor.
        </p>
      </LegalSection>

      <LegalSection id="acesso-veterinario" title="9. Acesso veterinário">
        <p>
          O tutor concede acesso a profissionais; o acesso pode ser temporário ou permanente,
          conforme as opções do produto; o tutor escolhe as permissões disponíveis; o tutor pode
          revogar o acesso. O veterinário recebe apenas o acesso autorizado. O acesso não
          transfere a titularidade dos dados.
        </p>
        <p>
          O PetID <strong>não</strong> é o profissional veterinário que presta atendimento médico.
          O serviço apenas intermedia o acesso autorizado aos dados do pet.
        </p>
      </LegalSection>

      <LegalSection id="assistente" title="10. Assistente PetID">
        <p>{LEGAL_POLICY_SNIPPETS.assistantDisclaimer}</p>
        <p>
          Não utilizamos linguagem que garanta acurácia médica. Em dúvida sobre a saúde do pet,
          procure um médico-veterinário.
        </p>
      </LegalSection>

      <LegalSection id="lembretes" title="11. Lembretes">
        <p>
          Lembretes existem para conveniência do usuário (conforme o plano) e ajudam a organizar
          rotinas, vacinas, medicamentos e compromissos.
        </p>
        <p>
          Não há garantia de entrega, pontualidade ou de que o usuário será notificado em todos os
          casos. Os lembretes são, principalmente, apresentados no próprio aplicativo. Estes Termos
          não afirmam envio por SMS, push ou e-mail como canal garantido.
        </p>
      </LegalSection>

      <LegalSection id="planos-assinatura" title="12. Planos e assinaturas recorrentes">
        <p>
          O plano <strong>Essencial</strong> é gratuito. Os planos pagos atuais são:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Guardião</strong>: R$&nbsp;9,90 por mês ou R$&nbsp;99 por ano.
          </li>
          <li>
            <strong>Família</strong>: R$&nbsp;14,90 por mês ou R$&nbsp;149 por ano.
          </li>
        </ul>
        <p>
          {LEGAL_POLICY_SNIPPETS.recurringBilling} O intervalo (mensal ou anual) e o preço
          aplicáveis são os apresentados no momento da contratação. {LEGAL_POLICY_SNIPPETS.noCardStorage}
        </p>
        <p>
          Benefícios e limites vigentes estão em{" "}
          <a href="/pricing" className="text-primary hover:underline">
            /pricing
          </a>
          . O PetID pode evoluir planos e funcionalidades de forma prospectiva, com comunicação
          adequada quando aplicável.
        </p>
      </LegalSection>

      <LegalSection id="cancelamento" title="13. Cancelamento">
        <p>Você pode cancelar a assinatura a qualquer momento pelos meios de gestão de cobrança do produto.</p>
        <p>{LEGAL_POLICY_SNIPPETS.cancellation}</p>
        <p>
          Limites do plano inferior podem restringir a criação ou o uso de funcionalidades premium
          conforme a arquitetura de entitlements, sem apagar automaticamente o histórico já
          armazenado.
        </p>
      </LegalSection>

      <LegalSection id="reembolso" title="14. Direito de arrependimento e reembolsos">
        <p>{LEGAL_POLICY_SNIPPETS.refund}</p>
        <p>
          Após o período legal aplicável, o cancelamento ordinário segue a seção de Cancelamento
          (impede renovação; acesso até o fim do período pago).
        </p>
      </LegalSection>

      <LegalSection id="direitos-consumidor" title="15. Direitos do consumidor">
        <p>
          Nada nestes Termos exclui, restringe ou renuncia direitos do consumidor previstos na
          legislação brasileira, incluindo o Código de Defesa do Consumidor (CDC), quando
          aplicáveis. Não inventamos cláusulas que pretendam afastar o direito legal de
          arrependimento.
        </p>
      </LegalSection>

      <LegalSection id="usos-proibidos" title="16. Usos proibidos">
        <p>É proibido, entre outras condutas:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Usar o PetID para fraude, engano ou prática ilícita.</li>
          <li>Acessar contas, dados ou recursos sem autorização.</li>
          <li>Cadastrar, controlar ou se apropriar de pets de terceiros sem direito.</li>
          <li>Abusar de convites ou acessos veterinários.</li>
          <li>Reivindicar ou ativar tags físicas que não lhe pertençam.</li>
          <li>Interferir na segurança, disponibilidade ou integridade do serviço.</li>
          <li>Utilizar o PetID de qualquer forma ilegal ou que viole direitos de terceiros.</li>
        </ul>
      </LegalSection>

      <LegalSection id="disponibilidade" title="17. Disponibilidade">
        <p>
          Buscamos manter o PetID disponível e em bom funcionamento, mas não prometemos
          disponibilidade ininterrupta.
        </p>
        <p>
          Podem ocorrer manutenções, falhas técnicas, indisponibilidades de prestadores ou outros
          eventos fora do nosso controle razoável.
        </p>
      </LegalSection>

      <LegalSection id="propriedade-intelectual" title="18. Propriedade intelectual">
        <p>
          A marca PetID, o software, a interface, o layout e demais elementos da plataforma são de
          titularidade do fornecedor ou de licenciantes, protegidos pela legislação aplicável.
        </p>
        <p>
          Conteúdo de usuário (fotos, documentos etc.) segue a seção “Conteúdo do usuário”: você
          mantém direitos aplicáveis; o PetID processa apenas o necessário para operar o serviço.
        </p>
      </LegalSection>

      <LegalSection id="atualizacoes" title="19. Atualizações dos Termos">
        <p>
          Podemos atualizar estes Termos periodicamente. A versão e a data de vigência constam no
          topo do documento. Alterações materiais geram nova versão; usuários autenticados podem
          ser solicitados a aceitar novamente pelos mecanismos do produto.
        </p>
      </LegalSection>

      <LegalSection id="lei-aplicavel" title="20. Lei aplicável">
        <p>Estes Termos são regidos pela legislação da República Federativa do Brasil.</p>
        <p>
          Nada neste documento limita direitos obrigatórios do consumidor ou de proteção de dados
          pessoais previstos em lei. Não estabelecemos foro exclusivo abusivo.
        </p>
      </LegalSection>
    </>
  );
}
