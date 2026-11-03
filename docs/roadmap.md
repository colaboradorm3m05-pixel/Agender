# Roadmap

## MVP — feito

Jornada completa validada no navegador: criar conta → onboarding → link público → reserva → agenda interna → reagendar → concluir → registrar pagamento. Ver README.

## Etapa A — Operação

| Item | Situação |
| --- | --- |
| Histórico de alterações importantes | **Feito** para agendamentos (criação, reagendamento, status, cancelamento), pagamentos, serviços e profissionais (`audit_logs`). Exibido no detalhe do agendamento. |
| Relatórios por período e profissional | **Feito**: `/painel/relatorios` com intervalo de datas livre (até 1 ano), filtro por profissional, totais, lista de concluídos e exportação CSV (Excel pt-BR, protegida contra CSV injection). Profissional vê só os próprios números (“Meus atendimentos”), sem valores recebidos. |
| Lembretes por e-mail | **Pendente** — depende de provedor de e-mail (ver integracoes.md). |
| Comissões | **Feito**: regras com vigência (`commission_rules`), percentual ou valor fixo, por profissional e/ou serviço; a mais específica vence; vigências sem sobreposição garantidas no banco. Comissão fotografada no atendimento ao concluir (`commission_*`), nunca recalculada por mudança de regra; desfazer a conclusão remove a fotografia. |

## Etapa B — Assinatura do SaaS

Pendente. Planos configuráveis e limites por plano (ex.: nº de profissionais), checkout em modo de teste, portal do cliente, webhooks verificados e idempotentes, tratamento de falha de pagamento e cancelamento (período de carência, modo somente leitura). Requer conta e chaves de teste do provedor.

## Etapa C — Integrações opcionais

Pendente: WhatsApp pela API oficial, sinal de reserva com provedor de pagamento. Só com provedor e credenciais.

## Outras melhorias conhecidas

- Recuperação de senha (depende de e-mail).
- Upload de foto do profissional (hoje: URL https).
- Escolha de empresa ativa quando um usuário pertencer a mais de uma (o modelo já permite; a interface usa a primeira).
- Testes end-to-end automatizados (Playwright) da jornada que hoje foi validada manualmente.
