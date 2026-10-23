import amqp from 'amqplib';

const url = process.env.RABBITMQ_URL;
if (!url) throw new Error('RABBITMQ_URL is required');

const routes = {
  'identity.events.v1': [
    'jobs.publication-changed',
    'companies.report-confirmed',
    'internships.assessment-recorded',
    'companies.on-site-passed',
  ],
  'job-management.events.v1': [
    'jobs.verification-completed',
    'jobs.review-decided',
    'jobs.suspension-requested',
    'companies.trust-changed',
  ],
  'verification-trust.events.v1': [
    'jobs.submitted',
    'jobs.edited',
    'jobs.transition-resolved',
    'jobs.publication-changed',
    'companies.trust-changed',
  ],
};

let connection;
for (let attempt = 1; attempt <= 20; attempt++) {
  try {
    connection = await amqp.connect(url);
    break;
  } catch (error) {
    if (attempt === 20) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

try {
  const channel = await connection.createChannel();
  await channel.assertExchange('internship.events.v1', 'topic', { durable: true });
  await channel.assertExchange('internship.retry.v1', 'direct', { durable: true });
  await channel.assertExchange('internship.retry.return.v1', 'direct', { durable: true });
  await channel.assertExchange('internship.dead.v1', 'direct', { durable: true });

  for (const [queue, keys] of Object.entries(routes)) {
    await channel.assertQueue(queue, { durable: true });
    for (const key of keys) await channel.bindQueue(queue, 'internship.events.v1', key);
    await channel.bindQueue(queue, 'internship.retry.return.v1', queue);

    for (const [index, delay] of [5000, 30000, 120000].entries()) {
      const retryQueue = `${queue}.retry.${index + 1}`;
      await channel.assertQueue(retryQueue, {
        durable: true,
        messageTtl: delay,
        deadLetterExchange: 'internship.retry.return.v1',
        deadLetterRoutingKey: queue,
      });
      await channel.bindQueue(retryQueue, 'internship.retry.v1', retryQueue);
    }

    const deadQueue = `${queue}.dlq`;
    await channel.assertQueue(deadQueue, { durable: true });
    await channel.bindQueue(deadQueue, 'internship.dead.v1', queue);
  }

  await channel.close();
  console.log('RabbitMQ exchange, queues, bindings, retry queues and DLQs are ready');
} finally {
  await connection.close();
}
