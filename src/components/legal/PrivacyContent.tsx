import { LegalPlaceholder, LegalSection } from "./LegalDocumentLayout";
import {
  LEGAL_IDENTITY,
  LEGAL_POLICY_SNIPPETS,
  LEGAL_WEBSITE,
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_ACTIVE,
  controllerCpfDisplay,
} from "@/lib/legal";

export function PrivacyContent() {
  const cpf = controllerCpfDisplay();

  return (
    <>
      <LegalSection id="controlador" title="1. Controlador">
        <p>
          Esta Política de Privacidade descreve como o PetID trata dados pessoais no contexto do
          serviço. O controlador dos dados é a pessoa física:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Nome: <strong>{LEGAL_IDENTITY.responsibleName}</strong>
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
            Site:{" "}
            <a href={LEGAL_WEBSITE} className="text-primary hover:underline">
              {LEGAL_WEBSITE}
            </a>
          </li>
          <li>
            Contato para privacidade:{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
              {SUPPORT_EMAIL}
            </a>
            {!SUPPORT_EMAIL_ACTIVE ? (
              <> (canal em configuração — pode ainda não estar plenamente operacional)</>
            ) : null}
          </li>
        </ul>
        <p>
          Esta Política descreve práticas implementadas. Não constitui certificação de conformidade
          (por exemplo, não afirmamos “100% LGPD compliant”).
        </p>
      </LegalSection>

      <LegalSection id="idade" title="2. Idade mínima">
        <p>{LEGAL_POLICY_SNIPPETS.ageMinimum}</p>
        <p>{LEGAL_POLICY_SNIPPETS.ageAssuranceNote}</p>
        <p>
          Não coletamos data de nascimento ou documento de identidade apenas para verificação de
          idade, salvo se um desenho de produto/jurídico aprovado passar a exigir.
        </p>
      </LegalSection>

      <LegalSection id="dados-conta" title="3. Dados da conta">
        <p>
          <strong>Categorias:</strong> nome; e-mail; telefone (quando informado); identificadores de
          autenticação/conta; preferências; registros de aceite de Termos e desta Política.
        </p>
        <p>
          <strong>Finalidade / base (alto nível):</strong> criar e autenticar a conta, prestar o
          serviço e cumprir obrigações contratuais e legais (execução de contrato / legítimo
          interesse operacional / obrigação legal, conforme o caso).
        </p>
        <p>
          <strong>Compartilhamento:</strong> processadores de autenticação/infraestrutura (ex.:
          Supabase; Google, se você escolher login Google).
        </p>
      </LegalSection>

      <LegalSection id="contatos" title="4. Contatos do tutor, emergência e cuidadores">
        <p>
          Você pode cadastrar contatos do tutor, de emergência e de cuidadores (nome, telefone,
          e-mail, relação). Ao informar dados de terceiros, você declara ter base legítima para
          fornecê-los.
        </p>
        <p>
          Contatos só aparecem no perfil público se você habilitar os campos correspondentes (ou via
          Modo Perdido, conforme suas escolhas).
        </p>
      </LegalSection>

      <LegalSection id="dados-pet" title="5. Dados do pet">
        <p>
          Tratamos informações que você cadastra para operar o serviço, incluindo: identificação do
          pet; foto; características; rotina; informações de saúde; vacinas; medicamentos;
          documentos; histórico/linha do tempo.
        </p>
        <p>
          Documentos podem conter dados pessoais de pessoas humanas (ex.: nome do tutor em receita).
          Registros de saúde do pet descrevem o animal; não os tratamos, por si só, como “dados
          sensíveis de saúde da pessoa usuária”, embora possam coexistir com dados pessoais humanos.
        </p>
        <p>
          <strong>Finalidade:</strong> operar o perfil, cuidados, lembretes, perfil público
          autorizado e acessos concedidos. <strong>Retenção:</strong> enquanto a conta/serviço
          exigir, ou pelo prazo necessário a obrigações legais, cobrança, segurança ou defesa de
          direitos.
        </p>
      </LegalSection>

      <LegalSection id="perfil-publico" title="6. Perfil público e privacidade por padrão">
        <p>
          O PetID segue privacidade por padrão no perfil público: dados sensíveis/privados do tutor
          e informações de saúde do pet permanecem ocultos até você habilitar expressamente um
          campo permitido.
        </p>
        <p>
          Qualquer pessoa com a URL ou o QR pode acessar o perfil público; apenas os campos
          autorizados são expostos. Ao ativar o Modo Perdido, você pode tornar públicas informações
          de contato/recuperação selecionadas de forma intencional.
        </p>
        <p>{LEGAL_POLICY_SNIPPETS.qrNotGps}</p>
      </LegalSection>

      <LegalSection id="acesso-vet" title="7. Acesso veterinário">
        <p>
          Podemos tratar registros de concessões de acesso (permissões, natureza temporária ou
          permanente, carimbos de tempo e identificadores da conta autenticada relacionada), para
          viabilizar o acesso que você autorizou e permitir auditoria/revogação.
        </p>
        <p>
          O veterinário recebe apenas o acesso autorizado. O acesso não transfere a titularidade dos
          dados. O PetID não presta o atendimento clínico.
        </p>
      </LegalSection>

      <LegalSection id="assinatura" title="8. Dados de cobrança / assinatura">
        <p>
          Em planos pagos, tratamos metadados necessários à cobrança e à liberação de recursos,
          tais como: identificadores de cliente/assinatura na Stripe; plano; intervalo;
          status/pagamento; metadados de ciclo de vida da assinatura.
        </p>
        <p>{LEGAL_POLICY_SNIPPETS.noCardStorage}</p>
      </LegalSection>

      <LegalSection id="dados-tecnicos" title="9. Dados técnicos e segurança">
        <p>
          Quando aplicável à operação e à segurança, podemos tratar: dados de sessão/autenticação;
          registros necessários à operação e segurança; carimbos de data e hora; e, conforme a
          infraestrutura, informações técnicas de acesso (por exemplo IP ou user-agent processados
          por provedores de hospedagem/rede).
        </p>
        <p>
          Uso limitado ao funcionamento, prevenção a abusos, diagnóstico de falhas e cumprimento de
          obrigações legais.
        </p>
      </LegalSection>

      <LegalSection id="bases-finalidades" title="10. Finalidades e bases legais (visão geral)">
        <p>Tratamos dados pessoais para, entre outras finalidades:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Criar e autenticar contas (execução de contrato).</li>
          <li>Operar pets, rotinas, histórico, documentos e lembretes (execução de contrato).</li>
          <li>Exibir perfil público/QR conforme suas configurações (execução de contrato / consentimento contextual às escolhas de visibilidade).</li>
          <li>Modo Perdido e contato (execução de contrato / suas configurações).</li>
          <li>Tags físicas ativadas (execução de contrato).</li>
          <li>Acessos de veterinários/cuidadores conforme concessões (execução de contrato).</li>
          <li>Assistente com base nos dados que você cadastra (execução de contrato).</li>
          <li>Assinaturas e cobrança (execução de contrato / obrigação legal contábil quando cabível).</li>
          <li>Suporte, segurança, fraude e obrigações legais (legítimo interesse / obrigação legal).</li>
        </ul>
      </LegalSection>

      <LegalSection id="prestadores" title="11. Prestadores e transferências">
        <p>
          Compartilhamos dados na medida necessária com prestadores que nos auxiliam, incluindo:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Supabase</strong> — banco de dados, autenticação, backend e armazenamento.
          </li>
          <li>
            <strong>Cloudflare</strong> — hospedagem, rede e infraestrutura.
          </li>
          <li>
            <strong>Stripe</strong> — pagamentos e assinaturas.
          </li>
          <li>
            <strong>Google</strong> — autenticação, quando você escolhe login com Google.
          </li>
        </ul>
        <p>
          Esses prestadores tratam dados conforme seus papéis e políticas. Pode haver processamento
          ou transferência internacional de dados, quando aplicável, observadas as exigências legais
          cabíveis. <strong>Não afirmamos</strong> que os dados permanecem fisicamente apenas no
          Brasil.
        </p>
        <p>
          O PetID <strong>não vende</strong> dados pessoais. Compartilhamentos também ocorrem por
          suas concessões (perfil público, veterinário, cuidador) ou obrigação legal.
        </p>
      </LegalSection>

      <LegalSection id="retencao" title="12. Retenção">
        <p>
          Mantemos dados enquanto necessários para prestar o serviço, cumprir obrigações legais,
          cobrança/contabilidade, prevenção a fraude/segurança ou exercício/defesa de direitos —
          somente pelo período e finalidade necessários, em linha com os princípios da LGPD.
        </p>
        <p>
          Não prometemos que literalmente todo registro desapareça de imediato em todos os sistemas
          intermediários; retenções mínimas legítimas podem existir.
        </p>
      </LegalSection>

      <LegalSection id="direitos-titular" title="13. Direitos do titular">
        <p>
          Você pode exercer direitos previstos na legislação aplicável (incluindo, quando cabíveis,
          acesso, correção, eliminação, portabilidade e informação sobre compartilhamentos), pelo
          e-mail{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
            {SUPPORT_EMAIL}
          </a>
          {!SUPPORT_EMAIL_ACTIVE ? " (quando operacional)" : null}, e pelos controles do produto
          quando disponíveis.
        </p>
      </LegalSection>

      <LegalSection id="exclusao-conta" title="14. Exclusão de conta">
        <p>
          A exclusão self-service está disponível em{" "}
          <strong>Configurações → Excluir minha conta</strong> (confirmação explícita). Não é
          necessário abrir chamado de suporte apenas para solicitar a exclusão ordinária da conta.
        </p>
        <p>
          Conforme a implementação atual: dados ordinários de conta/pets são removidos no processo
          de exclusão; arquivos de propriedade do usuário são removidos quando aplicável; tags
          físicas são desvinculadas/desabilitadas com segurança; assinatura ativa é tratada antes da
          exclusão quando a cobrança está configurada; após sucesso, a sessão é encerrada.
        </p>
        <p>
          Registros limitados podem ser retidos quando legitimamente necessários para obrigações
          legais/regulatórias, cobrança/contabilidade, prevenção a fraude/segurança ou exercício e
          defesa de direitos, apenas pelo período/finalidade necessários.
        </p>
      </LegalSection>

      <LegalSection id="atualizacoes" title="15. Atualizações da política">
        <p>
          Podemos atualizar esta Política periodicamente. A versão e a data de vigência constam no
          topo do documento. Alterações materiais geram nova versão e podem exigir novo aceite pelo
          gate legal do produto.
        </p>
      </LegalSection>
    </>
  );
}
