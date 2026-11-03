# Integrações e dependências externas

Nenhuma integração externa está ativa. Nada aqui é simulado: o que depende de credencial está **indisponível** até ser configurado.

| Recurso | Situação | Dependência |
| --- | --- | --- |
| Banco de dados | Funciona | PostgreSQL com `btree_gist` |
| Autenticação | Funciona (local) | Nenhuma externa; `BETTER_AUTH_SECRET` |
| Lembretes por e-mail | **Não implementado** | Provedor de e-mail transacional (ex.: Resend, SES, Postmark) + domínio verificado |
| Recuperação de senha por e-mail | **Não implementado** | Mesmo provedor de e-mail |
| Assinatura do SaaS (planos, checkout, portal, webhooks) | **Não implementado** | Stripe (ou similar) em modo de teste: chaves + segredo de webhook |
| Sinal de reserva pago pelo cliente | **Não implementado** | Provedor de pagamento (ex.: Mercado Pago/Stripe) |
| WhatsApp | **Não implementado** | API oficial (WhatsApp Business Platform / Cloud API) via provedor, número aprovado e templates aprovados |

Regras para quando forem implementadas:

- **Não** automatizar WhatsApp Web nem usar APIs não oficiais.
- Assinatura do SaaS (empresa → Agender) e pagamentos de clientes (cliente → barbearia) ficam em módulos e tabelas separados. A tabela `payments` atual é só registro manual da barbearia.
- Liberar funcionalidade paga somente a partir do **webhook verificado** (assinatura conferida, evento idempotente por `event.id`), nunca pela página de sucesso do checkout.
- Lembretes: tabela de envios com chave única `(appointment_id, tipo, horario_previsto)` para não duplicar; ao cancelar/reagendar, marcar pendentes como cancelados dentro da mesma transação; o envio confere o status atual do agendamento antes de mandar.
- Segredos só em variáveis de ambiente; logs sem tokens nem conteúdo das mensagens.
